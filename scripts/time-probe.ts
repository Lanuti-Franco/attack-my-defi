/** ¿Cuánto mueve el interés al health factor si sólo pasa el tiempo? */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { testClient } from '../lib/chain/client'
import { readPosition } from '../lib/chain/aave'
import { account } from '../lib/chain/client'

const DAY = 24 * 60 * 60

async function main() {
  const engine = new ScenarioEngine()
  const base = await engine.setup({
    collateral: { asset: 'WETH', amount: 100 },
    debt: { asset: 'USDC', amount: 150_000 },
  })
  console.log(`base: deuda $${base.debtUsd.toFixed(2)}  HF ${base.healthFactor.toFixed(6)}\n`)

  let elapsed = 0
  for (const days of [30, 90, 180, 365, 730]) {
    const delta = days - elapsed
    await testClient.increaseTime({ seconds: delta * DAY })
    await testClient.mine({ blocks: 1 })
    elapsed = days

    const s = await readPosition(account.address)
    const growth = ((s.debtUsd / base.debtUsd - 1) * 100).toFixed(2)
    console.log(
      `+${String(days).padStart(3)} días  →  deuda $${s.debtUsd.toFixed(2)} (+${growth}%)  HF ${s.healthFactor.toFixed(6)}  ${s.healthFactor < 1 ? 'LIQUIDABLE' : 'sobrevive'}`,
    )
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
