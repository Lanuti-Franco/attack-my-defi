/**
 * ¿La curva interpolada dice lo mismo que cotizar de verdad?
 *
 * Se prueba en puntos que no están en la tabla, que es donde la interpolación
 * podría desviarse. Si acá coincide, usar la tabla en vez del quoter no cambia
 * ningún número: sólo lo hace instantáneo.
 */
import { slippageForSale, IMPACT_CURVE_BLOCK } from '../lib/simulation/impactCurve'
import { measureMarketImpact } from '../lib/simulation/marketImpact'
import { publicClient } from '../lib/chain/client'

const BETWEEN_POINTS = [777, 3_333, 7_777, 13_421, 19_050, 23_500]

/** Más que esto ya movería el umbral que se le muestra al usuario. */
const TOLERANCE = 0.002

async function main() {
  const block = await publicClient.getBlockNumber()
  console.log(`curve measured at block ${IMPACT_CURVE_BLOCK} · fork at ${block}\n`)
  console.log('  amount     table     quoted     drift')

  let worst = 0
  for (const amount of BETWEEN_POINTS) {
    const interpolated = slippageForSale(amount)
    const quoted = (await measureMarketImpact('WETH', amount)).slippage
    const drift = Math.abs(interpolated - quoted)
    worst = Math.max(worst, drift)
    console.log(
      `  ${String(amount).padStart(7)}  ${(interpolated * 100).toFixed(2).padStart(6)}%  ` +
        `${(quoted * 100).toFixed(2).padStart(8)}%  ${(drift * 100).toFixed(3).padStart(6)} pts`,
    )
  }

  console.log(`\nworst drift: ${(worst * 100).toFixed(3)} percentage points`)
  if (worst > TOLERANCE) {
    console.error('The table drifts too far: more points are needed.')
    process.exit(1)
  }
  console.log('The table says the same as quoting.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message.slice(0, 300) : err)
  process.exit(1)
})
