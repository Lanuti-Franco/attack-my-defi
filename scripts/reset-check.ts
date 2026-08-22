/** ¿El reset deja de verdad el mundo limpio? */
import { readPosition } from '../lib/chain/aave'
import { resetFork } from '../lib/chain/reset'
import { publicClient, account } from '../lib/chain/client'

async function show(label: string) {
  const [block, position] = await Promise.all([
    publicClient.getBlockNumber(),
    readPosition(account.address),
  ])
  console.log(
    `${label}: bloque ${block} · colateral $${position.collateralUsd.toFixed(0)} · ` +
      `deuda $${position.debtUsd.toFixed(0)}`,
  )
  return position
}

async function main() {
  await show('antes  ')
  await resetFork()
  const after = await show('después')

  if (after.debtUsd > 1 || after.collateralUsd > 1) {
    console.error('\nEl reset NO limpió: quedó una posición en pie.')
    process.exit(1)
  }
  console.log('\nEl reset deja el mundo limpio.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message.slice(0, 300) : err)
  process.exit(1)
})
