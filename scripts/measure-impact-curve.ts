/**
 * Mide contra los pools reales cuánto hunde el precio vender WETH, y escribe la
 * curva como una tabla en el código.
 *
 * Se corre una vez por bloque pineado. Cotizar en vivo cuesta minutos la
 * primera vez —cruzar cientos de ticks son cientos de lecturas de storage que
 * el fork va a pedir de a una— y eso hacía inusable el vector de cascada. Pero
 * el bloque está congelado: la curva no cambia entre corridas, así que medirla
 * una vez y guardarla da exactamente los mismos números sin el costo.
 *
 * Correr con: pnpm impact-curve
 */
import { writeFileSync } from 'node:fs'
import { measureMarketImpact } from '../lib/simulation/marketImpact'
import { publicClient } from '../lib/chain/client'

/**
 * Denso abajo y espaciado arriba: la curva se dobla en las ventas chicas, así
 * que ahí es donde interpolar entre dos puntos lejanos daría error.
 */
const AMOUNTS = [
  100, 250, 500, 1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 6_500, 8_000, 10_000, 12_500, 15_000,
  17_500, 20_000, 22_500, 25_000,
]

const OUTPUT = 'lib/simulation/impactCurve.ts'

async function main() {
  const block = await publicClient.getBlockNumber()
  console.log(`midiendo la curva de impacto de WETH contra el bloque ${block}\n`)

  const points: { amount: number; slippage: number }[] = []
  for (const amount of AMOUNTS) {
    const startedAt = Date.now()
    const impact = await measureMarketImpact('WETH', amount)
    points.push({ amount, slippage: Number(impact.slippage.toFixed(6)) })
    console.log(
      `  ${String(amount).padStart(6)} WETH  ${(impact.slippage * 100).toFixed(2).padStart(6)}%  ` +
        `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    )
  }

  // Una curva que no crece delata una medición rota: vender más nunca puede
  // conseguir mejor precio.
  for (let i = 1; i < points.length; i++) {
    if (points[i].slippage < points[i - 1].slippage) {
      throw new Error(
        `La curva baja entre ${points[i - 1].amount} y ${points[i].amount} WETH. ` +
          'Vender más no puede dar mejor precio: la medición está mal.',
      )
    }
  }

  const rows = points.map((p) => `  { amount: ${p.amount}, slippage: ${p.slippage} },`).join('\n')
  writeFileSync(
    OUTPUT,
    `/**
 * Cuánto hunde el precio de WETH venderlo de golpe, medido contra los pools de
 * Uniswap V3 del bloque pineado.
 *
 * Generado por \`pnpm impact-curve\`. No editar a mano: si cambia el bloque,
 * volver a correrlo.
 *
 * Vive como tabla y no como cotización en vivo porque el bloque está congelado
 * —la curva es la misma en cada corrida— y cotizar cuesta minutos la primera
 * vez. Los números salen igual de los pools reales; lo único que cambia es
 * cuándo se leyeron.
 */
export const IMPACT_CURVE_BLOCK = ${block}n

export const IMPACT_CURVE: readonly { amount: number; slippage: number }[] = [
${rows}
]
`,
    'utf8',
  )
  console.log(`\nescrito en ${OUTPUT} · ${points.length} puntos`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message.slice(0, 300) : err)
  process.exit(1)
})
