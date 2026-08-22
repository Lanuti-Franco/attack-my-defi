/**
 * Caso de aceptación de WBTC: montar una posición con Bitcoin de colateral y
 * comprobar que Aave la reconoce igual que a una de ETH.
 */
import { ScenarioEngine } from '../lib/simulation/scenarioEngine'
import { vectorsFor } from '../lib/ai/vectors'
import { releaseForkLock } from '../lib/simulation/forkLock'

const SPEC = {
  collateral: { asset: 'WBTC' as const, amount: 5 },
  debt: { asset: 'USDC' as const, amount: 200_000 },
}

async function main() {
  const engine = new ScenarioEngine()
  const state = await engine.setup(SPEC)

  console.log(`colateral  $${state.collateralUsd.toLocaleString('es-AR')}`)
  console.log(`deuda      $${state.debtUsd.toLocaleString('es-AR')}`)
  console.log(`umbral     ${(state.liquidationThreshold * 100).toFixed(0)}%`)
  console.log(`HF         ${state.healthFactor.toFixed(4)}`)

  // El health factor que devuelve Aave tiene que coincidir con la fórmula.
  const expected = (state.collateralUsd * state.liquidationThreshold) / state.debtUsd
  const drift = Math.abs(expected - state.healthFactor)
  console.log(`\nfórmula    ${expected.toFixed(4)} · desvío ${drift.toFixed(6)}`)

  const vectors = vectorsFor({ collateral: SPEC.collateral, debt: SPEC.debt })
  console.log(`\nvectores que aplican: ${vectors.map((v) => v.label).join(', ')}`)

  // Un shock de precio tiene que mover el HF hacia abajo, y hacerlo vía Aave.
  // Que el shock apunte al activo correcto: si el colateral cae, el health
  // factor tiene que bajar. Verificar sólo que no explote deja pasar un shock
  // aplicado al activo equivocado, que es justo lo que pasó la primera vez.
  const crash = vectors.find((v) => v.id === 'price')
  if (!crash) {
    console.error('\nNo hay vector de precio para un colateral volátil.')
    process.exit(1)
  }
  const crashed = await engine.run(crash.mutate(-30))
  console.log(`\ncon BTC -30%: HF ${crashed.state.healthFactor.toFixed(4)} → ${crashed.verdict}`)

  const problems: string[] = []
  if (drift > 0.001) problems.push('El HF de Aave no coincide con la fórmula: revisá decimales.')
  if (crashed.state.healthFactor >= state.healthFactor) {
    problems.push(
      `Un BTC 30% más barato subió el health factor (${state.healthFactor.toFixed(4)} → ` +
        `${crashed.state.healthFactor.toFixed(4)}): el shock está pegándole al activo equivocado.`,
    )
  }

  if (problems.length) {
    console.error(`\n${problems.join('\n')}`)
    process.exit(1)
  }
  console.log('\nWBTC funciona.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message.slice(0, 400) : err)
    process.exitCode = 1
  })
  .finally(releaseForkLock)
