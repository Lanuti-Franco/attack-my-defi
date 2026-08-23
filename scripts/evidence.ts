/**
 * ¿Qué tan confiable es un modelo de 4B corriendo local para esto?
 *
 * Corre el mismo ataque varias veces, cada una con una semilla distinta, y
 * mide dos cosas separadas que suelen confundirse:
 *
 *   1. Si converge al mismo umbral. Es la que importa para creerle al número:
 *      si cinco búsquedas independientes coinciden, el resultado no depende de
 *      una semilla afortunada.
 *   2. Cuántas veces el código tuvo que suplir al modelo. Es la diferencia
 *      entre "usa bien las herramientas" y "lo sostenemos nosotros", y hay que
 *      poder decirla con un número.
 *
 * Correr con: pnpm evidence [corridas]
 */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { vectorsFor } from '../lib/ai/vectors'
import { searchThreshold, type ModelStats } from '../lib/ai/liquidator'
import { ensureModel } from '../lib/ai/localModel'
import { MODEL_LABEL } from '../lib/ai/modelName'
import type { Strategy } from '../lib/schemas/strategy'
import { releaseForkLock } from '../lib/simulation/forkLock'

const STRATEGY: Strategy = {
  collateral: { asset: 'WETH', amount: 100 },
  debt: { asset: 'USDC', amount: 150_000 },
}

const VECTOR_ID = 'price'
const RUNS = Number(process.argv[2] ?? 5)

interface Run {
  seed: number
  threshold: number | null
  label: string | null
  probes: number
  stats: ModelStats
  seconds: number
}

function pad(v: string | number, width: number) {
  return String(v).padStart(width)
}

async function main() {
  const engine = new ScenarioEngine()
  const base = await engine.setup(STRATEGY)
  const modelId = await ensureModel()

  const vector = vectorsFor(STRATEGY).find((v) => v.id === VECTOR_ID)
  if (!vector) throw new Error(`Attack ${VECTOR_ID} does not apply to this position`)

  console.log(`Tool use evidence — ${MODEL_LABEL}, running locally via QVAC`)
  console.log(
    `Position: ${STRATEGY.collateral.amount} ${STRATEGY.collateral.asset} / ` +
      `${STRATEGY.debt.amount.toLocaleString('en-US')} ${STRATEGY.debt.asset} · ` +
      `starting HF ${base.healthFactor.toFixed(4)}`,
  )
  console.log(`Attack: ${vector.label} · ${RUNS} runs, a different seed each time\n`)

  const runs: Run[] = []
  for (let i = 0; i < RUNS; i++) {
    const seed = 100 + i
    const startedAt = Date.now()

    const search = searchThreshold({ engine, vector, modelId, base, strategy: STRATEGY, seed })
    let step = await search.next()
    while (!step.done) step = await search.next()
    const outcome = step.value

    runs.push({
      seed,
      threshold: outcome.threshold,
      label: outcome.thresholdLabel,
      probes: outcome.probes.length,
      stats: outcome.modelStats,
      seconds: (Date.now() - startedAt) / 1000,
    })

    const last = runs[runs.length - 1]
    console.log(
      `  seed ${pad(seed, 3)} → ${pad(last.label ?? 'no liquidation', 14)} ` +
        `in ${pad(last.probes, 2)} probes · ${pad(last.seconds.toFixed(0), 3)}s`,
    )
  }

  // Convergencia: qué tan de acuerdo están las corridas entre sí.
  const found = runs.filter((r) => r.threshold !== null)
  console.log(`\n${'─'.repeat(64)}`)
  if (found.length === 0) {
    console.log('No run found a threshold.')
  } else {
    const values = found.map((r) => r.threshold as number)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const spread = Math.max(...values) - Math.min(...values)
    console.log(
      `Threshold: found in ${found.length}/${RUNS} runs · ` +
        `mean ${mean.toFixed(2)} · spread ${spread.toFixed(2)} points`,
    )
  }

  // Tool use: cuántas veces el modelo hizo lo que tenía que hacer.
  const totals = runs.reduce<ModelStats>(
    (acc, r) => ({
      calls: acc.calls + r.stats.calls,
      refusals: acc.refusals + r.stats.refusals,
      corrections: acc.corrections + r.stats.corrections,
      repeats: acc.repeats + r.stats.repeats,
    }),
    { calls: 0, refusals: 0, corrections: 0, repeats: 0 },
  )
  const clean = totals.calls - totals.refusals - totals.corrections - totals.repeats
  const rate = totals.calls ? (clean / totals.calls) * 100 : 0

  console.log(
    `Tool use: ${totals.calls} requests · ${clean} returned a usable call with no ` +
      `fixing (${rate.toFixed(0)}%)`,
  )
  console.log(
    `  answered in prose without calling the tool: ${totals.refusals}\n` +
      `  proposed an out-of-range value, had to be clamped: ${totals.corrections}\n` +
      `  proposed a scenario already tried: ${totals.repeats}`,
  )
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message.slice(0, 400) : err)
    process.exitCode = 1
  })
  .finally(releaseForkLock)
