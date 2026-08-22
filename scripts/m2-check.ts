/**
 * Gate de M2: el atacante tiene que converger al mismo número que M1.
 *
 * Criterio: converge en ≤ 8 simulaciones y el shock mínimo que reporta coincide
 * con la fórmula analítica sobre el estado real, dentro de 1 punto porcentual
 * (el atacante busca con precisión ~0,1, no hace bisección exhaustiva).
 */
import { runAttack } from '../lib/ai/liquidator'
import { ensureModel, releaseModel, MODEL_NAME } from '../lib/ai/localModel'

const REFERENCE = { supplyWeth: 100, borrowUsdc: 150_000 }
const TOLERANCE = 1.0

async function main() {
  console.log(`cargando ${MODEL_NAME} (la primera vez descarga ~2,5 GB)...`)
  await ensureModel((pct: number, stage: string) => {
    if (pct % 25 === 0) console.log(`  ${stage}: ${pct}%`)
  })
  console.log('modelo listo\n')

  let attempts = 0
  let analytic: number | null = null
  let minimal: number | null = null

  for await (const ev of runAttack({ strategy: REFERENCE })) {
    switch (ev.type) {
      case 'position':
        analytic = -(1 - ev.debtUsd / ev.liquidationThreshold / ev.collateralUsd) * 100
        console.log(
          `posición: $${ev.collateralUsd.toFixed(0)} colateral · $${ev.debtUsd.toFixed(0)} deuda · HF ${ev.healthFactor.toFixed(4)}`,
        )
        console.log(`shock crítico según la fórmula: ${analytic.toFixed(2)}%\n`)
        break
      case 'thinking':
        console.log(`🤖 ${ev.text}`)
        break
      case 'attempt':
        attempts++
        console.log(
          `   ETH ${ev.shockPct.toFixed(2).padStart(7)}%  →  HF ${ev.healthFactor.toFixed(4).padStart(8)}  ${ev.verdict}`,
        )
        break
      case 'conclusion':
        minimal = ev.minimalShockPct
        console.log(`\n🤖 ${ev.text}`)
        break
      case 'error':
        console.error(`❌ ${ev.message}`)
        break
    }
  }

  console.log(`\nsimulaciones usadas : ${attempts}`)
  console.log(`shock mínimo hallado: ${minimal?.toFixed(2) ?? 'ninguno'}%`)
  console.log(`fórmula             : ${analytic?.toFixed(2)}%`)

  if (minimal === null || analytic === null) {
    console.error('\n❌ GATE M2 FALLA — el atacante no encontró ningún shock que liquide')
    process.exit(1)
  }
  const delta = Math.abs(minimal - analytic)
  if (delta > TOLERANCE) {
    console.error(`\n❌ GATE M2 FALLA — desvío de ${delta.toFixed(2)} puntos`)
    process.exit(1)
  }
  if (attempts > 8) {
    console.error(`\n⚠️  GATE M2 PARCIAL — correcto pero usó ${attempts} simulaciones (esperado ≤ 8)`)
    process.exit(1)
  }
  console.log(`\n✅ GATE M2 PASA — ${attempts} simulaciones, desvío ${delta.toFixed(2)} puntos`)
  await releaseModel()
}

main().catch((e) => {
  console.error('\n❌ error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
