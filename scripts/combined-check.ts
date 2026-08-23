/**
 * ¿Sirve de algo el modelo, o el azar hace lo mismo?
 *
 * Es la pregunta incómoda que hay que poder contestar con un número. Buscar el
 * umbral de un ataque suelto es bisección, y ahí el modelo no aporta nada que
 * un `while` no haga mejor. La combinación es otra cosa: el espacio son todos
 * los subconjuntos de ataques por todas sus intensidades, y no hay fórmula.
 *
 * Así que se lo compara contra el baseline más tonto posible —elegir ataques e
 * intensidades al azar— con el mismo presupuesto de intentos. Si el modelo no
 * le gana, hay que decirlo.
 */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { vectorsFor } from '../lib/ai/vectors'
import { searchThreshold } from '../lib/ai/liquidator'
import { searchCombination, type KnownVector } from '../lib/ai/combined'
import { ensureModel } from '../lib/ai/localModel'
import { releaseForkLock } from '../lib/simulation/forkLock'
import type { Strategy } from '../lib/schemas/strategy'
import type { Mutation } from '../lib/simulation/mutations'

const STRATEGY: Strategy = {
  collateral: { asset: 'WETH', amount: 100 },
  debt: { asset: 'USDC', amount: 150_000 },
}

const RUNS = Number(process.argv[2] ?? 3)
const BUDGET = 6
/** Se puede barrer para ver a qué altura de la vara el problema deja de ser trivial. */
const SUBCRITICAL = Number(process.argv[3] ?? 0.6)

/** Elige ataques e intensidades sin ningún criterio. El piso contra el que medir. */
function randomCombination(all: KnownVector[]): Mutation[] {
  // Los mismos ataques que ve el modelo: los que necesitan preparar el mundo
  // quedan afuera de las dos ramas, o la comparación no sería justa.
  const known = all.filter((k) => !k.vector.prepare)
  const howMany = 2 + Math.floor(Math.random() * 2)
  const shuffled = [...known].sort(() => Math.random() - 0.5).slice(0, howMany)

  return shuffled.flatMap(({ vector, threshold }) => {
    const ceiling = threshold === null ? vector.bounds.extreme : threshold * SUBCRITICAL
    const { safe } = vector.bounds
    return vector.mutate(safe + Math.random() * (ceiling - safe))
  })
}

async function main() {
  const engine = new ScenarioEngine()
  const base = await engine.setup(STRATEGY)
  const modelId = await ensureModel()
  const vectors = vectorsFor(STRATEGY)

  console.log(`posición: HF ${base.healthFactor.toFixed(4)}`)
  console.log('midiendo primero cuánto aguanta cada ataque por separado…\n')

  // Los umbrales individuales son el punto de partida: sin ellos no se sabe qué
  // intensidad es "insuficiente por sí sola".
  const known: KnownVector[] = []
  for (const vector of vectors) {
    // La preparación cara la hace searchThreshold por dentro: repetirla acá
    // deja dos activas y la segunda falla.
    const search = searchThreshold({ engine, vector, modelId, base, strategy: STRATEGY })
    let step = await search.next()
    while (!step.done) step = await search.next()
    known.push({ vector, threshold: step.value.threshold })
    const say = vector.formatForModel ?? vector.format
    console.log(
      `  ${vector.label.padEnd(28)} ${
        step.value.threshold === null ? 'no liquida solo' : say(step.value.threshold)
      }`,
    )
  }

  console.log(`\ncombinando, ${RUNS} corridas de cada uno, ${BUDGET} intentos como techo\n`)

  const modelTries: (number | null)[] = []
  for (let i = 0; i < RUNS; i++) {
    const search = searchCombination({ engine, known, modelId, seed: 200 + i })
    let step = await search.next()
    while (!step.done) step = await search.next()
    const outcome = step.value
    const used = outcome.winner ? outcome.tries.length : null
    modelTries.push(used)
    console.log(
      `  modelo  corrida ${i + 1}: ${
        used === null ? `sin liquidar en ${outcome.tries.length}` : `liquidó en ${used}`
      }` + (outcome.winner ? ` · HF ${outcome.winner.healthFactor.toFixed(4)}` : ''),
    )
  }

  const randomTries: (number | null)[] = []
  for (let i = 0; i < RUNS; i++) {
    let used: number | null = null
    for (let attempt = 1; attempt <= BUDGET; attempt++) {
      const result = await engine.run(randomCombination(known))
      if (result.state.healthFactor < 1) {
        used = attempt
        break
      }
    }
    randomTries.push(used)
    console.log(`  azar    corrida ${i + 1}: ${used === null ? `sin liquidar en ${BUDGET}` : `liquidó en ${used}`}`)
  }

  const summarize = (label: string, tries: (number | null)[]) => {
    const wins = tries.filter((t): t is number => t !== null)
    const rate = (wins.length / tries.length) * 100
    const avg = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null
    console.log(
      `  ${label.padEnd(8)} liquidó en ${wins.length}/${tries.length} corridas (${rate.toFixed(0)}%)` +
        (avg === null ? '' : ` · ${avg.toFixed(1)} intentos en promedio`),
    )
  }

  console.log(`\n${'─'.repeat(64)}`)
  summarize('modelo', modelTries)
  summarize('azar', randomTries)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message.slice(0, 400) : err)
    process.exitCode = 1
  })
  .finally(releaseForkLock)
