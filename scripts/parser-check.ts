/** Gate del parser: frases reales tienen que dar la estrategia correcta. */
import { parseStrategy } from '../lib/ai/parser'
import { ensureModel, releaseModel } from '../lib/ai/localModel'

interface Case {
  text: string
  expect: { ca: string; camt: number; da: string; damt: number } | null
}

const CASES: Case[] = [
  { text: 'deposito 100 ETH y pido prestados 150k USDC', expect: { ca: 'WETH', camt: 100, da: 'USDC', damt: 150000 } },
  { text: 'pongo 200000 USDC de colateral y saco 62 WETH', expect: { ca: 'USDC', camt: 200000, da: 'WETH', damt: 62 } },
  { text: 'tengo 50 eth depositados en aave y debo 80000 dolares', expect: { ca: 'WETH', camt: 50, da: 'USDC', damt: 80000 } },
  { text: 'deposito 10 WETH, pido 15000 USDC', expect: { ca: 'WETH', camt: 10, da: 'USDC', damt: 15000 } },
  { text: 'hola como andas', expect: null },
]

async function main() {
  const modelId = await ensureModel()
  let pass = 0

  for (const c of CASES) {
    const { strategy, problem } = await parseStrategy(c.text, modelId)
    const got = strategy
      ? `${strategy.collateral.amount} ${strategy.collateral.asset} → ${strategy.debt.amount} ${strategy.debt.asset}`
      : `(rechazado: ${problem?.slice(0, 50)})`

    let ok: boolean
    if (c.expect === null) {
      ok = strategy === null
    } else {
      ok =
        !!strategy &&
        strategy.collateral.asset === c.expect.ca &&
        strategy.collateral.amount === c.expect.camt &&
        strategy.debt.asset === c.expect.da &&
        strategy.debt.amount === c.expect.damt
    }
    if (ok) pass++
    console.log(`${ok ? '✅' : '❌'} "${c.text}"`)
    console.log(`     → ${got}`)
  }

  console.log(`\n${pass}/${CASES.length} casos correctos`)
  await releaseModel()
  process.exit(pass === CASES.length ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
