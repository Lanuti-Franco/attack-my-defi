/**
 * Gate de M1.
 *
 * Comprueba que el shock mínimo que encuentra el motor (donde el health factor
 * que devuelve AAVE cruza 1) coincide con la fórmula analítica aplicada al
 * estado real de la posición:
 *
 *     colateral_crítico = deuda / liquidationThreshold
 *     shock             = 1 - colateral_crítico / colateral
 *
 * El esperado se deriva del estado leído, no se hardcodea: así el test sigue
 * siendo correcto aunque cambie el bloque pineado y con él el precio de WETH.
 */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { assertForkAlive } from '../lib/chain/client'

const REFERENCE = {
  collateral: { asset: 'WETH' as const, amount: 100 },
  debt: { asset: 'USDC' as const, amount: 150_000 },
}
const TOLERANCE = 0.05

const fmt = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))

async function main() {
  const block = await assertForkAlive()
  console.log(`fork vivo en el bloque ${block}\n`)

  const engine = new ScenarioEngine()
  console.log('montando la posición de referencia (100 WETH → 150k USDC)...')
  const base = await engine.setup(REFERENCE)

  console.log(`  colateral        $${base.collateralUsd.toLocaleString('es-AR')}`)
  console.log(`  deuda            $${base.debtUsd.toLocaleString('es-AR')}`)
  console.log(`  liq. threshold   ${(base.liquidationThreshold * 100).toFixed(2)}%`)
  console.log(`  health factor    ${fmt(base.healthFactor)}`)

  if (base.debtUsd < 1) throw new Error('La posición quedó sin deuda: el borrow no se ejecutó.')

  console.log('\nescenarios:')
  for (const pct of [-10, -20, -25, -26, -30, -40]) {
    const r = await engine.runPriceShock(pct)
    console.log(
      `  WETH ${String(pct).padStart(4)}%  →  HF ${fmt(r.state.healthFactor).padStart(8)}  ${r.verdict}`,
    )
  }

  // Shock mínimo según el motor (bisección sobre lo que responde Aave)
  let lo = 0
  let hi = -60
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    const r = await engine.runPriceShock(mid)
    if (r.verdict === 'LIQUIDATABLE') hi = mid
    else lo = mid
  }
  const measured = hi

  // Shock mínimo según la fórmula, sobre el estado real leído de la cadena
  const criticalCollateral = base.debtUsd / base.liquidationThreshold
  const analytic = -(1 - criticalCollateral / base.collateralUsd) * 100

  console.log(`\nshock mínimo medido por el motor (Aave): ${measured.toFixed(4)}%`)
  console.log(`shock mínimo según la fórmula          : ${analytic.toFixed(4)}%`)

  const delta = Math.abs(measured - analytic)
  console.log(`desvío                                 : ${delta.toFixed(4)} puntos`)

  if (delta > TOLERANCE) {
    console.error(`\n❌ GATE M1 FALLA — el motor y la fórmula no coinciden`)
    process.exit(1)
  }
  console.log(`\n✅ GATE M1 PASA — Aave y la fórmula coinciden dentro de ${TOLERANCE} puntos`)
}

main().catch((e) => {
  console.error('\n❌ error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
