import { completion } from '@qvac/sdk'
import { z } from 'zod'
import { ScenarioEngine, type ScenarioResult } from '../simulation/scenarioEngine'
import type { Strategy, AttackEvent } from '../schemas/strategy'
import { ensureModel, GENERATION_PARAMS } from './localModel'
import { vectorsFor, type AttackVector } from './vectors'
import { computeAttackerProfit } from '../simulation/liquidationProfit'
import { readAssetPrice } from '../chain/aave'
import { ASSETS } from '../chain/addresses'

/** Cuántas simulaciones puede pedir el atacante antes de que lo cortemos. */
const MAX_STEPS = 10
/**
 * Convergencia: cuando el rango entre "sobrevive" y "se liquida" baja del 2% del
 * espacio de búsqueda, refinar más no cambia lo que se ve en pantalla.
 */
const CONVERGENCE_FRACTION = 0.02

/** Una simulación ya ejecutada. Es todo lo que el modelo sabe entre pasos. */
interface Probe {
  intensity: number
  healthFactor: number
  liquidated: boolean
}

/**
 * El modelo local es una fuente no confiable, como el input de un usuario: puede
 * devolver un valor fuera de rango, con el signo invertido, o no llamar a la
 * herramienta. Se normaliza en el borde en vez de dejar que llegue al simulador.
 */
function clampToBounds(raw: number, vector: AttackVector): number | null {
  if (!Number.isFinite(raw)) return null
  const { safe, extreme } = vector.bounds
  const lo = Math.min(safe, extreme)
  const hi = Math.max(safe, extreme)

  // En los vectores porcentuales un modelo chico manda +25 cuando quiere decir
  // -25: tomamos la magnitud y le damos la dirección correcta en vez de
  // rechazar la llamada, porque rechazarla gasta un turno y suele repetir el
  // error. En los que se expresan como precio absoluto el signo es información
  // real —0,75 no es lo mismo que -0,75— así que sólo se acota al rango.
  const oriented =
    vector.scale === 'percent' ? (extreme < safe ? -Math.abs(raw) : Math.abs(raw)) : raw
  return Math.min(hi, Math.max(lo, oriented))
}

/** Qué tan lejos está una intensidad del mundo tranquilo. 0 = nada pasa, 1 = extremo. */
function severity(intensity: number, vector: AttackVector): number {
  const { safe, extreme } = vector.bounds
  return Math.abs(intensity - safe) / Math.abs(extreme - safe)
}

/** El rango donde todavía puede estar el umbral, según lo ya medido. */
function bracketOf(probes: Probe[], vector: AttackVector) {
  const survived = probes.filter((p) => !p.liquidated)
  const killed = probes.filter((p) => p.liquidated)

  // El umbral que buscamos es el ataque más suave que todavía liquida.
  const mildestKill = killed.length
    ? killed.reduce((a, b) => (severity(a.intensity, vector) <= severity(b.intensity, vector) ? a : b))
    : null
  const harshestSurvival = survived.length
    ? survived.reduce((a, b) => (severity(a.intensity, vector) >= severity(b.intensity, vector) ? a : b))
    : null

  return { mildestKill, harshestSurvival }
}

/**
 * Le pide al modelo la próxima intensidad a probar.
 *
 * Devuelve `null` si no llamó a la herramienta, que pasa: un modelo de 4B a veces
 * contesta en prosa en vez de actuar. Quien llama decide qué hacer con eso.
 */
async function chooseNextProbe(
  modelId: string,
  probes: Probe[],
  vector: AttackVector,
): Promise<{ intensity: number; rationale: string } | null> {
  const { mildestKill, harshestSurvival } = bracketOf(probes, vector)

  const historyLines = probes.length
    ? probes
        .map(
          (p) =>
            `${vector.format(p.intensity)} -> health factor ${p.healthFactor.toFixed(4)} (${
              p.liquidated ? 'LIQUIDATABLE' : 'survived'
            })`,
        )
        .join('\n')
    : '(nothing tested yet)'

  // Le damos el rango ya acotado en vez de dejar que lo deduzca del historial.
  // Con la pregunta abierta, un modelo de 4B barre en incrementos fijos y se
  // queda con un valor grueso; con el rango explícito, biseca.
  let guidance: string
  if (!probes.length) {
    guidance = `Start with a severe scenario, around ${vector.format(vector.bounds.extreme)}, to confirm the position can be broken at all.`
  } else if (!mildestKill) {
    guidance = `Nothing has liquidated it yet. The harshest tested is ${vector.format(
      harshestSurvival!.intensity,
    )}. Test something clearly more severe.`
  } else if (!harshestSurvival) {
    guidance = `Everything tested liquidates it. The mildest is ${vector.format(
      mildestKill.intensity,
    )}. Test something milder, closer to ${vector.format(vector.bounds.safe)}.`
  } else {
    guidance = `The threshold is between ${vector.format(
      mildestKill.intensity,
    )} (liquidates) and ${vector.format(
      harshestSurvival.intensity,
    )} (survives). Test the midpoint of that range.`
  }

  const run = completion({
    modelId,
    stream: false,
    generationParams: GENERATION_PARAMS,
    history: [
      {
        role: 'system',
        content: `You attack DeFi positions on Aave V3. ${vector.briefing}

Call simulate exactly once with the next value to test. It runs a real simulation on an
Ethereum mainnet fork and returns the health factor reported by the Aave contract. A
position is liquidatable when its health factor is below 1.

Never estimate a health factor yourself. Only the tool knows it.

When you are given a search range, test its midpoint. Halving the range on every step
finds the answer far faster than sweeping in fixed increments.`,
      },
      {
        role: 'user',
        content: `Simulations so far:\n${historyLines}\n\n${guidance}\n\nWhat value should we test next?`,
      },
    ],
    tools: [
      {
        name: 'simulate',
        description:
          'Runs a real simulation on an Ethereum mainnet fork and returns the health factor ' +
          'reported by the Aave V3 contract. The only valid source of health factors.',
        parameters: z.object({
          [vector.paramName]: z.number().describe(vector.paramDescription),
        }) as never,
      },
    ],
  })

  const final = await run.final
  const call = (await final.toolCalls).find((c) => c.name === 'simulate')
  if (!call) return null

  const raw = Number((call.arguments as Record<string, unknown>)[vector.paramName])
  const intensity = clampToBounds(raw, vector)
  if (intensity === null) return null

  return {
    intensity,
    rationale: (final as { content?: string }).content?.trim() ?? '',
  }
}

export interface AttackOptions {
  strategy: Strategy
  vector?: AttackVector
  modelId?: string
}

/**
 * Ataca la posición hasta encontrar el umbral en que se vuelve liquidable.
 *
 * El reparto de trabajo es deliberado: el modelo elige qué escenario probar en
 * cada paso, todo número que se muestra sale del contrato de Aave sobre el fork,
 * y el bucle de búsqueda vive en el código porque un modelo local chico no
 * sostiene una búsqueda de varios pasos por su cuenta.
 */
export async function* runAttack(opts: AttackOptions): AsyncGenerator<AttackEvent> {
  const vector = opts.vector ?? vectorsFor(opts.strategy)[0]
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
    const choice = await chooseNextProbe(modelId, probes, vector)

    if (!choice) {
      if (++refusals >= 2) {
        yield {
          type: 'error',
          message: 'El modelo local dejó de proponer escenarios. Corto la búsqueda acá.',
        }
        break
      }
      continue
    }

    // Repetir un escenario ya medido no aporta nada y gasta un paso.
    const alreadyTested = probes.some(
      (p) => Math.abs(severity(p.intensity, vector) - severity(choice.intensity, vector)) < 0.001,
    )
    if (alreadyTested) continue

    if (choice.rationale) yield { type: 'thinking', text: choice.rationale }

    let result: ScenarioResult
    try {
      result = await engine.run(vector.mutate(choice.intensity))
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
      break
    }

    const liquidated = result.verdict === 'LIQUIDATABLE'
    probes.push({
      intensity: choice.intensity,
      healthFactor: result.state.healthFactor,
      liquidated,
    })

    yield {
      type: 'attempt',
      label: vector.format(choice.intensity),
      intensity: choice.intensity,
      healthFactor: result.state.healthFactor,
      verdict: result.verdict,
      collateralUsd: result.state.collateralUsd,
    }

    const { mildestKill, harshestSurvival } = bracketOf(probes, vector)
    if (
      mildestKill &&
      harshestSurvival &&
      Math.abs(
        severity(mildestKill.intensity, vector) - severity(harshestSurvival.intensity, vector),
      ) <= CONVERGENCE_FRACTION
    ) {
      break
    }
  }

  const { mildestKill } = bracketOf(probes, vector)

  if (mildestKill === null) {
    yield {
      type: 'conclusion',
      vectorLabel: vector.label,
      threshold: null,
      thresholdLabel: null,
      text: `Tras ${probes.length} simulaciones no encontré ningún escenario que la liquide.`,
    }
    return
  }

  // Sólo la manipulación de oráculo deja una ganancia para el atacante: en un
  // crash real el colateral vale de verdad lo que el feed dice.
  let attackerProfitUsd: number | undefined
  let profitLine = ''
  if (vector.isOracleManipulation && vector.targetAsset) {
    const marketPrice = await readAssetPrice(ASSETS[vector.targetAsset].address)
    const manipulatedPrice = marketPrice * (1 + mildestKill.intensity / 100)
    const profit = await computeAttackerProfit({
      collateralAsset: opts.strategy.collateral.asset,
      debtUsd: base.debtUsd,
      collateralUsd: base.collateralUsd,
      healthFactor: mildestKill.healthFactor,
      manipulatedPrice,
      marketPrice,
    })

    if (profit) {
      attackerProfitUsd = profit.profitUsd
      profitLine =
        ` Con esa desviación, quien liquide repaga $${profit.debtRepaidUsd.toFixed(0)} y se lleva ` +
        `colateral que en el mercado vale $${profit.collateralMarketValueUsd.toFixed(0)}: ` +
        `$${profit.profitUsd.toFixed(0)} de ganancia, con el bonus de liquidación del ` +
        `${(profit.liquidationBonus * 100).toFixed(1)}% que publica Aave.` +
        (profit.cappedByCollateral
          ? ' El colateral de la posición no alcanza para el bonus completo, así que se lleva todo lo que hay.'
          : '')
    }
  }

  yield {
    type: 'conclusion',
    vectorLabel: vector.label,
    threshold: mildestKill.intensity,
    thresholdLabel: vector.format(mildestKill.intensity),
    attackerProfitUsd,
    text:
      `Con ${probes.length} simulaciones: ${vector.format(mildestKill.intensity)} deja la ` +
      `posición liquidable. Todos los health factors los devolvió el contrato de Aave.` +
      profitLine,
  }
}
