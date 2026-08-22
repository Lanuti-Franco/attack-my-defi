import { runAttack } from '../lib/ai/liquidator'
import { vectorById } from '../lib/ai/vectors'
import { ensureModel, releaseModel } from '../lib/ai/localModel'

const STRATEGY = {
  collateral: { asset: 'WETH' as const, amount: 100 },
  debt: { asset: 'USDC' as const, amount: 180_000 },
}

async function main() {
  await ensureModel()
  const vector = vectorById(STRATEGY, 'cascade')!
  console.log(`### ${vector.label}\n${vector.premise}\n`)
  for await (const ev of runAttack({ strategy: STRATEGY, vector })) {
    if (ev.type === 'position')
      console.log(`posición: HF ${ev.healthFactor.toFixed(4)}\n`)
    if (ev.type === 'attempt')
      console.log(`   ${ev.label.padEnd(26)} → HF ${ev.healthFactor.toFixed(4)}  ${ev.verdict}`)
    if (ev.type === 'conclusion') console.log(`\n→ ${ev.text}`)
    if (ev.type === 'error') console.log(`   ⚠️  ${ev.message}`)
  }
  await releaseModel()
}
main().catch((e) => { console.error(e); process.exit(1) })
