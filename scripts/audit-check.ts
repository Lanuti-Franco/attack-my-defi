import { runAudit } from '../lib/ai/audit'
import { ensureModel, releaseModel } from '../lib/ai/localModel'

const STRATEGY = {
  collateral: { asset: 'WETH' as const, amount: 100 },
  debt: { asset: 'USDC' as const, amount: 180_000 },
}

async function main() {
  await ensureModel()
  const t0 = Date.now()
  const thresholds: string[] = []

  for await (const ev of runAudit({ strategy: STRATEGY })) {
    switch (ev.type) {
      case 'position':
        console.log(
          `POSICIÓN: colateral $${ev.collateralUsd.toFixed(0)} · deuda $${ev.debtUsd.toFixed(0)} · HF ${ev.healthFactor.toFixed(4)}\n`,
        )
        break
      case 'auditStart':
        console.log(`corriendo ${ev.vectorCount} vectores...\n`)
        break
      case 'vectorStart':
        console.log(`── ${ev.label}`)
        break
      case 'attempt':
        console.log(`     ${ev.label.padEnd(22)} HF ${ev.healthFactor.toFixed(4)}  ${ev.verdict}`)
        break
      case 'vectorDone':
        console.log(`   → ${ev.thresholdLabel ?? 'no la liquida'}  (${ev.steps} sims)\n`)
        thresholds.push(`${ev.label}: ${ev.thresholdLabel ?? '—'}`)
        break
      case 'recommendations':
        console.log('\n═══ RECOMENDACIONES ═══')
        for (const r of ev.recommendations) {
          console.log(`\n${r.profileLabel} — sobrevive ${r.benchmark}`)
          if (r.alreadySafe) {
            console.log(`   ✅ tu posición ya lo aguanta (HF ${r.resultingHealthFactor.toFixed(4)})`)
          } else {
            console.log(`   deuda máxima: $${r.maxDebtUsd.toFixed(0)}`)
            console.log(`   tenés que repagar $${r.repayUsd.toFixed(0)}`)
            console.log(`   HF verificado tras el ajuste: ${r.resultingHealthFactor.toFixed(4)}`)
          }
        }
        break
      case 'error':
        console.log(`⚠️  ${ev.message}`)
        break
    }
  }

  console.log(`\n─── resumen ───`)
  thresholds.forEach((t) => console.log(`  ${t}`))
  console.log(`\ntiempo total: ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  await releaseModel()
}
main().catch((e) => { console.error(e); process.exit(1) })
