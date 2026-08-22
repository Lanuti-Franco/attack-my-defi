import { completion } from '@qvac/sdk'
import { z } from 'zod'
import { ScenarioEngine, type ScenarioResult } from '../simulation/scenarioEngine'
import type { Strategy, AttackEvent } from '../schemas/strategy'
import { ensureModel, GENERATION_PARAMS } from './localModel'

/** Cuántas simulaciones puede pedir el atacante antes de que lo cortemos. */
const MAX_STEPS = 10
/** Cuando el rango entre "sobrevive" y "se liquida" baja de esto, ya está. */
const CONVERGENCE_POINTS = 0.5

const TOOL_NAME = 'simulate_price_shock'

const SYSTEM = `You attack DeFi positions on Aave V3. You are looking for the smallest
ETH price drop that makes a position liquidatable.

Call ${TOOL_NAME} exactly once with the next price drop to test. It runs a real
simulation on an Ethereum mainnet fork and returns the health factor reported by the
Aave contract. A position is liquidatable when its health factor is below 1.

Never estimate a health factor yourself. Only the tool knows it.

When you are given a search range, test its midpoint. Narrowing the range by half on
every step finds the answer far faster than sweeping in fixed increments.`

/**
 * Una simulación ya ejecutada, tal como se le muestra al modelo.
 * Es el único conocimiento que tiene: no recuerda nada más entre pasos.
 */
interface Probe {
  shockPct: number
  healthFactor: number
  liquidated: boolean
}

/**
 * El modelo local es una fuente de datos no confiable, como el input de un
 * usuario: puede pedir un shock con el signo invertido, fuera de rango, o no
 * pedir nada. Esta capa lo normaliza en el borde en vez de dejar que esos
 * errores se filtren al simulador.
 */
const shockSchema = z
  .object({ shock_pct: z.number().finite() })
  .transform(({ shock_pct }) => -Math.min(99, Math.abs(shock_pct)))

/**
 * Le pide al modelo el próximo shock a probar, dado lo que ya se midió.
 *
 * Devuelve `null` si el modelo no llamó a la herramienta — que pasa: un modelo
 * de 4B a veces contesta en prosa en vez de actuar. Quien llama decide qué
 * hacer con eso.
 */
async function chooseNextShock(
  modelId: string,
  probes: Probe[],
): Promise<{ shockPct: number; rationale: string } | null> {
  const historyLines = probes.length
    ? probes
        .map(
          (p) =>
            `ETH ${p.shockPct.toFixed(2)}% -> health factor ${p.healthFactor.toFixed(4)} (${
              p.liquidated ? 'LIQUIDATABLE' : 'survived'
            })`,
        )
        .join('\n')
    : '(nothing tested yet)'

  // Le damos el rango ya acotado en vez de dejar que lo deduzca del historial.
  // Con la pregunta abierta, un modelo de 4B barre en incrementos fijos y se
  // queda con un valor grueso; con el rango explícito, biseca.
  const { survived, liquidated } = bracketOf(probes)
  const guidance =
    liquidated === null
      ? probes.length
        ? `Nothing has liquidated the position yet. The largest drop tested is ${survived.toFixed(2)}%. Test something clearly more severe.`
        : `Start with a large drop to check the position can be liquidated at all.`
      : `The answer is between ${liquidated.toFixed(2)}% (liquidates) and ${survived.toFixed(2)}% (survives). Test the midpoint of that range.`

  const run = completion({
    modelId,
    stream: false,
    generationParams: GENERATION_PARAMS,
    history: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Simulations so far:\n${historyLines}\n\n${guidance}\n\nWhat ETH price drop should we test next?`,
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description:
          'Simulates an ETH price drop on a real Ethereum mainnet fork and returns the ' +
          'health factor reported by the Aave V3 contract. The only valid source of health factors.',
        parameters: z.object({
          shock_pct: z
            .number()
            .describe('ETH price change in percent. Negative: -25 means ETH drops 25%.'),
        }),
      },
    ],
  })

  const final = await run.final
  const calls = await final.toolCalls
  const call = calls.find((c) => c.name === TOOL_NAME)
  if (!call) return null

  const parsed = shockSchema.safeParse(call.arguments)
  if (!parsed.success) return null

  return {
    shockPct: parsed.data,
    rationale: (final as { content?: string }).content?.trim() ?? '',
  }
}

/** El rango donde todavía puede estar el shock crítico, según lo medido. */
function bracketOf(probes: Probe[]): { survived: number; liquidated: number | null } {
  const survived = probes.filter((p) => !p.liquidated).map((p) => p.shockPct)
  const liquidated = probes.filter((p) => p.liquidated).map((p) => p.shockPct)
  return {
    survived: survived.length ? Math.min(...survived) : 0,
    liquidated: liquidated.length ? Math.max(...liquidated) : null,
  }
}

export interface AttackOptions {
  strategy: Strategy
  modelId?: string
}

/**
 * Ataca la posición hasta encontrar el shock mínimo que la liquida.
 *
 * El reparto de trabajo es deliberado: el modelo elige qué escenario probar en
 * cada paso, y todo número que se muestra sale del contrato de Aave sobre el
 * fork. El bucle, la convergencia y la validación viven en el código, porque un
 * modelo local chico no sostiene una búsqueda de varios pasos por su cuenta.
 */
export async function* runAttack(opts: AttackOptions): AsyncGenerator<AttackEvent> {
  const engine = new ScenarioEngine()
  const base = await engine.setup(opts.strategy)

  yield {
    type: 'position',
    collateralUsd: base.collateralUsd,
    debtUsd: base.debtUsd,
    healthFactor: base.healthFactor,
    liquidationThreshold: base.liquidationThreshold,
  }

  if (base.debtUsd < 1) {
    yield {
      type: 'error',
      message: 'La posición no tiene deuda, así que no puede liquidarse. Pedí prestado algo.',
    }
    return
  }

  const modelId = opts.modelId ?? (await ensureModel())
  const probes: Probe[] = []
  let refusals = 0

  for (let step = 0; step < MAX_STEPS; step++) {
    const choice = await chooseNextShock(modelId, probes)

    if (!choice) {
      refusals++
      if (refusals >= 2) {
        yield {
          type: 'error',
          message: 'El modelo local dejó de proponer escenarios. Corto la búsqueda acá.',
        }
        break
      }
      continue
    }

    // Repetir un shock ya medido no aporta nada y gasta un paso.
    if (probes.some((p) => Math.abs(p.shockPct - choice.shockPct) < 0.01)) {
      continue
    }

    if (choice.rationale) yield { type: 'thinking', text: choice.rationale }

    let result: ScenarioResult
    try {
      result = await engine.runPriceShock(choice.shockPct)
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      break
    }

    const liquidated = result.verdict === 'LIQUIDATABLE'
    probes.push({
      shockPct: choice.shockPct,
      healthFactor: result.state.healthFactor,
      liquidated,
    })

    yield {
      type: 'attempt',
      shockPct: choice.shockPct,
      healthFactor: result.state.healthFactor,
      verdict: result.verdict,
      collateralUsd: result.state.collateralUsd,
    }

    const { survived, liquidated: worstKill } = bracketOf(probes)
    if (worstKill !== null && Math.abs(survived - worstKill) <= CONVERGENCE_POINTS) break
  }

  const { liquidated: minimalShock } = bracketOf(probes)

  yield {
    type: 'conclusion',
    minimalShockPct: minimalShock,
    text:
      minimalShock === null
        ? `Tras ${probes.length} simulaciones no encontré ninguna caída que la liquide.`
        : `Con ${probes.length} simulaciones: una caída de ETH del ${Math.abs(minimalShock).toFixed(1)}% ` +
          `deja la posición liquidable. Todos los health factors los devolvió el contrato de Aave.`,
  }
}
