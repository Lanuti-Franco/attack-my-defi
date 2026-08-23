/** Una sola propuesta de combinación, para ver qué contesta el modelo. */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { vectorsFor } from '../lib/ai/vectors'
import { searchCombination, type KnownVector } from '../lib/ai/combined'
import { ensureModel } from '../lib/ai/localModel'
import { releaseForkLock } from '../lib/simulation/forkLock'
import type { Strategy } from '../lib/schemas/strategy'

const STRATEGY: Strategy = {
  collateral: { asset: 'WETH', amount: 100 },
  debt: { asset: 'USDC', amount: 150_000 },
}

/**
 * Umbrales medidos en una corrida real, puestos a mano para no volver a
 * pagarlos: acá se prueba el diálogo con el modelo, no la medición.
 */
const KNOWN_THRESHOLDS: Record<string, number | null> = {
  price: -27.5,
  time: null,
  governance: 21.3,
  liquidity: null,
  cascade: null,
}

async function main() {
  const engine = new ScenarioEngine()
  await engine.setup(STRATEGY)
  const modelId = await ensureModel()

  const known: KnownVector[] = vectorsFor(STRATEGY).map((vector) => ({
    vector,
    threshold: KNOWN_THRESHOLDS[vector.id] ?? null,
  }))

  const search = searchCombination({ engine, known, modelId })
  let step = await search.next()
  while (!step.done) {
    const t = step.value
    console.log(
      `intento: ${t.ingredients.map((i) => `${i.label}=${i.intensity.toFixed(2)}`).join(' + ')} → HF ${t.healthFactor.toFixed(4)}`,
    )
    step = await search.next()
  }
  const outcome = step.value
  console.log(`resultado: ${outcome.winner ? 'liquidó' : 'no liquidó'} · ${outcome.tries.length} intentos`)
  if (outcome.failure) console.log(`se cortó por: ${outcome.failure}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message.slice(0, 400) : err)
    process.exitCode = 1
  })
  .finally(releaseForkLock)
