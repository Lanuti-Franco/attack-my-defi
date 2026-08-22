import type { Address } from 'viem'
import { testClient, assertForkAlive } from '../chain/client'
import { readPosition, type PositionState } from '../chain/aave'
import { buildPosition, type StrategySpec } from './position'
import { applyMutation, describeMutation, resetBasePrices, type Mutation } from './mutations'
import { forgetInstalledFeeds } from './oracle'
import { resetFork } from '../chain/reset'

export type Verdict = 'SURVIVED' | 'LIQUIDATABLE'

export interface ScenarioResult {
  mutations: Mutation[]
  description: string
  state: PositionState
  verdict: Verdict
}

/** Aave liquida cuando el health factor cae por debajo de 1. */
export function verdictOf(healthFactor: number): Verdict {
  return healthFactor < 1 ? 'LIQUIDATABLE' : 'SURVIVED'
}

/**
 * Mantiene un snapshot del mundo con la posición ya montada, y corre cada escenario
 * partiendo siempre de ahí. Sin el revert los shocks se acumularían y el segundo
 * escenario partiría de un mundo ya roto.
 */
export class ScenarioEngine {
  private baseSnapshot: `0x${string}` | null = null
  private user: Address | null = null
  private spec: StrategySpec | null = null

  async setup(spec: StrategySpec): Promise<PositionState> {
    await assertForkAlive()
    this.spec = spec

    // Volver el fork al bloque pineado antes de construir nada. Sin esto, dos
    // corridas seguidas acumulan colateral y los números dejan de ser
    // reproducibles — que es justo lo que no puede pasar en el video.
    await resetFork()

    resetBasePrices()
    forgetInstalledFeeds()

    this.user = await buildPosition(spec)
    this.baseSnapshot = await testClient.snapshot()
    return readPosition(this.user)
  }

  /** Estado de la posición sin ninguna mutación aplicada. */
  async baseline(): Promise<PositionState> {
    this.assertReady()
    return readPosition(this.user!)
  }

  /**
   * Aplica las mutaciones, le pregunta a Aave cómo quedó la posición, y revierte.
   * El health factor que devuelve lo calcula el contrato de Aave, no este código.
   */
  async run(mutations: Mutation[]): Promise<ScenarioResult> {
    this.assertReady()

    for (const m of mutations) await applyMutation(m)
    const state = await readPosition(this.user!)

    await this.revertToBase()

    return {
      mutations,
      description: mutations.map(describeMutation).join(' · '),
      state,
      verdict: verdictOf(state.healthFactor),
    }
  }

  /** Atajo para el vector más común: un shock de precio sobre el colateral. */
  async runPriceShock(pct: number): Promise<ScenarioResult> {
    return this.run([{ type: 'priceShock', asset: 'WETH', pct }])
  }

  private async revertToBase(): Promise<void> {
    await testClient.revert({ id: this.baseSnapshot! })
    // Un revert invalida el snapshot en Anvil: hay que tomar uno nuevo.
    this.baseSnapshot = await testClient.snapshot()
    // Los contratos mock deployados después del snapshot dejaron de existir.
    forgetInstalledFeeds()
  }

  private assertReady(): void {
    if (!this.user || !this.baseSnapshot) {
      throw new Error('ScenarioEngine sin inicializar: llamá setup() primero')
    }
  }
}
