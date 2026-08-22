import { vectorsFor } from '../lib/ai/vectors'

const CASES = [
  { label: 'WETH colateral / USDC deuda', s: { collateral: { asset: 'WETH' as const, amount: 100 }, debt: { asset: 'USDC' as const, amount: 180_000 } } },
  { label: 'USDC colateral / WETH deuda', s: { collateral: { asset: 'USDC' as const, amount: 200_000 }, debt: { asset: 'WETH' as const, amount: 62 } } },
]
for (const c of CASES) {
  console.log(`\n${c.label}:`)
  for (const v of vectorsFor(c.s)) console.log(`   ${v.id.padEnd(12)} ${v.label}`)
}
