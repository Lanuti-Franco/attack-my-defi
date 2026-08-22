/**
 * Gate de los tres vectores: cada uno tiene que encontrar su propio umbral,
 * y los umbrales tienen que ser distintos entre sí (si no, no son ataques
 * distintos: es el mismo con otro nombre).
 */
import { runAttack } from '../lib/ai/liquidator'
import { vectorsFor } from '../lib/ai/vectors'
import { ensureModel, releaseModel } from '../lib/ai/localModel'

const STRATEGY = {
  collateral: { asset: 'USDC' as const, amount: 200_000 },
  debt: { asset: 'WETH' as const, amount: 62 },
}

async function main() {
  await ensureModel()
  const results: Record<string, { label: string | null; steps: number; secs: number }> = {}

  for (const vector of vectorsFor(STRATEGY)) {
    const id = vector.id
    console.log(`\n### ${vector.label} — ${vector.premise}`)
    let steps = 0
    let label: string | null = null
    const t0 = Date.now()

    for await (const ev of runAttack({ strategy: STRATEGY, vector })) {
      if (ev.type === 'attempt') {
        steps++
        console.log(
          `   ${ev.label.padEnd(18)} → HF ${ev.healthFactor.toFixed(4).padStart(8)}  ${ev.verdict}`,
        )
      }
      if (ev.type === 'conclusion') {
        label = ev.thresholdLabel
        if (ev.attackerProfitUsd !== undefined) {
          console.log(`   💰 ganancia del atacante: $${ev.attackerProfitUsd.toFixed(0)}`)
        }
      }
      if (ev.type === 'error') console.log(`   ⚠️  ${ev.message}`)
    }
    const secs = (Date.now() - t0) / 1000
    results[id] = { label, steps, secs }
    console.log(`   → umbral: ${label ?? 'no encontrado'}  (${steps} simulaciones, ${secs.toFixed(0)}s)`)
  }

  console.log('\n=== resumen ===')
  let ok = true
  for (const [id, r] of Object.entries(results)) {
    const mark = r.label ? '✅' : '❌'
    if (!r.label) ok = false
    console.log(`${mark} ${id.padEnd(10)} ${(r.label ?? '—').padEnd(18)} (${r.steps} sims, ${r.secs.toFixed(0)}s)`)
  }
  await releaseModel()
  process.exit(ok ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
