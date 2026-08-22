/** ¿Cuánto hunde el precio vender colateral de golpe? */
import { measureMarketImpact } from '../lib/simulation/marketImpact'

async function main() {
  console.log('venta de WETH en Uniswap V3 (pools reales del fork)\n')
  console.log('  cantidad     precio efectivo    slippage')
  for (const amount of [1000, 5000, 10000, 20000, 40000, 80000, 150000]) {
    const i = await measureMarketImpact('WETH', amount)
    console.log(
      `  ${String(amount).padStart(6)} WETH   $${i.effectivePrice.toFixed(2).padStart(9)}    ${(i.slippage * 100).toFixed(2)}%`,
    )
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
