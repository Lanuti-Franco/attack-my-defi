/** Una posición imposible tiene que explicarse, no reventar. */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { releaseForkLock } from '../lib/simulation/forkLock'

async function main() {
  const engine = new ScenarioEngine()
  try {
    await engine.setup({
      collateral: { asset: 'WETH', amount: 0.1 },
      debt: { asset: 'USDC', amount: 150_000 },
    })
    console.error('MAL: aceptó una posición que Aave no puede montar')
    process.exitCode = 1
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(message)
    if (/0x[0-9a-f]{8}|revert|ABI/i.test(message)) {
      console.error('\nMAL: el mensaje sigue siendo técnico')
      process.exitCode = 1
    } else {
      console.log('\nBien: dice qué pasa y qué hacer.')
    }
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message.slice(0, 300) : err)
    process.exitCode = 1
  })
  .finally(releaseForkLock)
