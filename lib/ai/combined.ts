import { completion } from '@qvac/sdk'
import { z } from 'zod'
import { GENERATION_PARAMS } from './localModel'
import type { AttackVector } from './vectors'
import type { ScenarioEngine } from '../simulation/scenarioEngine'
import type { Mutation } from '../simulation/mutations'
import { safeMessage } from '../chain/redact'

/** Cuántas combinaciones se prueban antes de darse por vencido. */
const MAX_TRIES = 6

/**
 * Qué tan por debajo de su umbral individual tiene que quedar cada componente.
 *
 * Es lo que hace difícil el problema: si el modelo puede meter un ataque que ya
 * liquida solo, no encontró nada —la combinación sobra—.
 *
 * El 40% se eligió midiendo. Con el tope al 85% cada pieza quedaba tan cerca de
 * alcanzar sola que cualquier mezcla liquidaba; al 60% la estrategia ganadora
 * era "poner todo al máximo permitido", que no necesita criterio. Recién al 40%
 * hay que elegir bien qué combinar, y ahí la diferencia contra tirar los dados
 * aparece: 10 de 10 contra 7 de 10.
 */
const SUBCRITICAL = Number(process.env.COMBINED_SUBCRITICAL ?? 0.4)

export interface Ingredient {
  vectorId: string
  label: string
  intensity: number
}

export interface Combination {
  ingredients: Ingredient[]
  healthFactor: number
  liquidated: boolean
  rationale: string
}

export interface CombinedOutcome {
  tries: Combination[]
  /** La primera combinación que liquidó, si alguna lo logró. */
  winner: Combination | null
  failure?: string
  /**
   * Cuántos turnos se fueron sin producir una combinación nueva: el modelo no
   * llamó a la herramienta, propuso un solo ingrediente, o repitió algo ya
   * probado. Cuentan porque gastan presupuesto, y sin este número "no encontró
   * nada en seis intentos" puede querer decir que sólo probó dos.
   */
  wasted: number
}

/** Lo que ya sabemos de cada ataque por separado, que es de dónde parte esto. */
export interface KnownVector {
  vector: AttackVector
  /** El umbral individual, o null si por sí solo no liquida. */
  threshold: number | null
}

/**
 * Qué tan fuerte puede entrar un ataque en una combinación.
 *
 * Si tiene umbral propio, hasta un poco por debajo. Si nunca liquidó por su
 * cuenta, puede ir hasta su extremo: ahí no hay nada que limitar porque ni el
 * peor caso alcanzaba.
 */
function ceilingFor({ vector, threshold }: KnownVector): number {
  if (threshold === null) return vector.bounds.extreme

  // Se interpola desde el punto tranquilo hacia el umbral, no se multiplica el
  // umbral por la fracción. No es lo mismo: un ataque que se mide como precio
  // absoluto arranca en 1,00 y baja, así que multiplicar un umbral de $0,80 por
  // 0,6 da $0,48 —bastante *más* severo que el umbral, justo lo contrario de lo
  // que este tope tiene que garantizar—. Interpolando da $0,88, que sí queda
  // corto por sí solo.
  const { safe } = vector.bounds
  return safe + (threshold - safe) * SUBCRITICAL
}

/**
 * Acota una propuesta al rango donde sigue siendo individualmente insuficiente.
 *
 * En los ataques que se miden en porcentaje se le corrige el signo igual que en
 * la búsqueda individual: un modelo chico manda `+25` cuando quiere decir `-25`,
 * y rechazar la llamada por eso gasta un turno y suele repetir el error. Donde
 * el valor es un precio absoluto el signo sí es información y no se toca.
 */
function clampIngredient(raw: number, known: KnownVector): number {
  const { safe } = known.vector.bounds
  const ceiling = ceilingFor(known)
  const lo = Math.min(safe, ceiling)
  const hi = Math.max(safe, ceiling)

  const oriented =
    known.vector.scale === 'percent'
      ? ceiling < safe
        ? -Math.abs(raw)
        : Math.abs(raw)
      : raw

  return Math.min(hi, Math.max(lo, oriented))
}

/** El nombre del parámetro de cada ataque dentro de la herramienta combinada. */
function slotName(vector: AttackVector): string {
  return `${vector.id}_${vector.paramName}`
}

function describe(known: KnownVector[]): string {
  return known
    .map(({ vector, threshold }) => {
      const say = vector.formatForModel ?? vector.format
      const ceiling = say(ceilingFor({ vector, threshold }))
      const alone =
        threshold === null
          ? 'never liquidates the position on its own'
          : `liquidates it alone at ${say(threshold)}`
      return `- ${slotName(vector)}: ${vector.paramDescription} This attack ${alone}. Stay at or below ${ceiling}. Use ${say(vector.bounds.safe)} to leave it out.`
    })
    .join('\n')
}

/**
 * Busca una combinación de ataques que liquide la posición cuando ninguno lo
 * logra por separado.
 *
 * Es el único lugar donde el modelo hace algo que el código no podría hacer
 * igual de bien. Buscar el umbral de un ataque suelto es bisección: dado el
 * intervalo, el próximo valor es el punto medio, y eso es un `while` de tres
 * líneas. Acá no hay fórmula: el espacio son todos los subconjuntos de ataques
 * por todas sus intensidades, y elegir cuál mezcla vale la pena probar depende
 * de entender que el tiempo y la liquidez empujan los dos sobre la deuda, o que
 * el precio y el umbral de liquidación muerden los dos sobre el colateral.
 */
export async function* searchCombination(opts: {
  engine: ScenarioEngine
  known: KnownVector[]
  modelId: string
  seed?: number
}): AsyncGenerator<Combination, CombinedOutcome> {
  const { engine, modelId, seed } = opts
  const tries: Combination[] = []

  // Los ataques que necesitan preparar el mundo antes de correr quedan afuera.
  // La preparación es cara, va contra un snapshot propio y sólo puede haber una
  // activa por vez, así que no se pueden montar varias a la vez para una misma
  // combinación. Con los que quedan alcanza de sobra para mezclar.
  const known = opts.known.filter((k) => !k.vector.prepare)
  if (known.length < 2) {
    return { tries, winner: null, wasted: 0, failure: 'At least two combinable attacks are needed.' }
  }

  let wasted = 0
  const alreadyTried = new Set<string>()

  const slots = Object.fromEntries(
    known.map((k) => [
      slotName(k.vector),
      z.number().describe(k.vector.paramDescription),
    ]),
  )

  for (let step = 0; step < MAX_TRIES; step++) {
    let proposal: { ingredients: Ingredient[]; rationale: string } | null
    try {
      proposal = await propose(modelId, known, tries, slots, seed)
    } catch (err) {
      return { tries, winner: null, wasted, failure: safeMessage(err) }
    }

    // Menos de dos ingredientes no es una combinación: es un ataque suelto que
    // ya sabemos que no alcanza.
    if (!proposal || proposal.ingredients.length < 2) {
      wasted++
      continue
    }

    // Repetir una mezcla ya probada gasta un turno sin traer información: la
    // cadena va a contestar exactamente lo mismo.
    const fingerprint = proposal.ingredients
      .map((ing) => `${ing.vectorId}:${ing.intensity.toFixed(4)}`)
      .sort()
      .join('|')
    if (alreadyTried.has(fingerprint)) {
      wasted++
      continue
    }
    alreadyTried.add(fingerprint)

    const mutations: Mutation[] = proposal.ingredients.flatMap((ing) => {
      const vector = known.find((k) => k.vector.id === ing.vectorId)!.vector
      return vector.mutate(ing.intensity)
    })

    let healthFactor: number
    try {
      const result = await engine.run(mutations)
      healthFactor = result.state.healthFactor
    } catch (err) {
      return { tries, winner: null, wasted, failure: safeMessage(err) }
    }

    const attempt: Combination = {
      ingredients: proposal.ingredients,
      healthFactor,
      liquidated: healthFactor < 1,
      rationale: proposal.rationale,
    }
    tries.push(attempt)
    yield attempt

    if (attempt.liquidated) return { tries, winner: attempt, wasted }
  }

  return { tries, winner: null, wasted }
}

async function propose(
  modelId: string,
  known: KnownVector[],
  tries: Combination[],
  slots: Record<string, z.ZodTypeAny>,
  seed?: number,
): Promise<{ ingredients: Ingredient[]; rationale: string } | null> {
  const history = tries.length
    ? tries
        .map((t) => {
          const parts = t.ingredients
            .map((i) => {
              const vector = known.find((k) => k.vector.id === i.vectorId)!.vector
              return `${slotName(vector)}=${(vector.formatForModel ?? vector.format)(i.intensity)}`
            })
            .join(' + ')
          return `${parts} -> health factor ${t.healthFactor.toFixed(4)} (${
            t.liquidated ? 'LIQUIDATED' : 'survived'
          })`
        })
        .join('\n')
    : 'Nothing tried yet.'

  const run = completion({
    modelId,
    stream: false,
    generationParams: {
      ...GENERATION_PARAMS,
      ...(seed === undefined ? {} : { seed }),
      // Cada intento fallido sube la temperatura. Con la temperatura fija de la
      // búsqueda individual el modelo repite su primera idea hasta agotar el
      // presupuesto, y acá repetir no informa nada: lo que hace falta es que
      // pruebe otra cosa.
      temp: Math.min(0.9, GENERATION_PARAMS.temp + tries.length * 0.15),
    },
    history: [
      {
        role: 'system',
        content: `You attack DeFi positions on Aave V3. Each attack below is too weak to liquidate
this position on its own. Your job is to combine two or three of them so that together they do.

Attacks available:
${describe(known)}

Some attacks push on the debt and others on the collateral. Two that push the same way add up
more than two that push on different things.

Call simulate_combination exactly once, filling at least two attacks. It runs a real simulation
on an Ethereum mainnet fork and returns the health factor reported by the Aave contract. The
position is liquidated when that health factor drops below 1.

Never estimate a health factor yourself. Only the tool knows it.`,
      },
      {
        role: 'user',
        content:
          `Combinations tried so far:\n${history}\n\n` +
          (tries.length
            ? 'Every combination above survived. Proposing any of them again wastes a turn: ' +
              'the chain will answer exactly the same. Change something — swap which attacks ' +
              'you use, or push harder on the ones you keep, staying within each limit.\n\n'
            : '') +
          'Propose the next combination.',
      },
    ],
    tools: [
      {
        name: 'simulate_combination',
        description: 'Applies several attacks at once and returns the resulting health factor.',
        parameters: z.object(slots) as never,
      },
    ],
  })

  const final = await run.final
  const calls = await final.toolCalls
  const call = calls.find((c) => c.name === 'simulate_combination')

  if (process.env.DEBUG_COMBINED) {
    console.error(
      `[combinado] llamadas: ${JSON.stringify(calls)} · texto: ${
        (final as { content?: string }).content?.slice(0, 200) ?? ''
      }`,
    )
  }

  if (!call) return null

  const args = call.arguments as Record<string, unknown>
  const ingredients: Ingredient[] = []

  for (const k of known) {
    const raw = Number(args[slotName(k.vector)])
    if (!Number.isFinite(raw) || raw === k.vector.bounds.safe) continue

    const intensity = clampIngredient(raw, k)
    // Un valor que cae de vuelta en "no hacer nada" no es un ingrediente.
    if (intensity === k.vector.bounds.safe) continue

    ingredients.push({ vectorId: k.vector.id, label: k.vector.label, intensity })
  }

  return {
    ingredients,
    rationale: (final as { content?: string }).content?.trim() ?? '',
  }
}
