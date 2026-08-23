import type { Address } from 'viem'
import { testClient, assertForkAlive } from '../chain/client'
import { readPosition, type PositionState } from '../chain/aave'
import { buildPosition, type StrategySpec } from './position'
import {
  applyMutation,
  captureBasePrices,
  resetBasePrices,
  type Mutation,
} from './mutations'
import { forgetInstalledFeeds } from './oracle'
import { resetFork } from '../chain/reset'
import { acquireForkLock } from './forkLock'

export type Verdict = 'SURVIVED' | 'LIQUIDATABLE'

export interface ScenarioResult {
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
  /** Snapshot del mundo limpio, mientras haya una preparación activa. */
  private pristineSnapshot: `0x${string}` | null = null

  async setup(spec: StrategySpec): Promise<PositionState> {
    await assertForkAlive()
    acquireForkLock(
      `${spec.collateral.amount} ${spec.collateral.asset} / ${spec.debt.amount} ${spec.debt.asset}`,
    )

    // Volver el fork al bloque pineado antes de construir nada. Sin esto, dos
    // corridas seguidas acumulan colateral y los números dejan de ser
    // reproducibles — que es justo lo que no puede pasar en el video.
    await resetFork()

    resetBasePrices()
    forgetInstalledFeeds()

    this.user = await buildPosition(spec)

    // Los precios de referencia se capturan ahora, con el mundo intacto y antes
    // de que exista ningún mock. Si se leyeran perezosamente al aplicar la
    // primera mutación, un escenario que combine dos mutaciones sobre el mismo
    // activo tomaría como "precio base" uno que ya fue manipulado.
    await captureBasePrices([spec.collateral.asset, spec.debt.asset])

    this.baseSnapshot = await testClient.snapshot()
    return readPosition(this.user)
  }

  /**
   * Aplica una preparación cara una sola vez y la deja fija como punto de
   * partida de los escenarios siguientes.
   *
   * Sirve para el trabajo que un vector necesita repetir en cada escenario pero
   * que no cambia entre ellos —por ejemplo dejar a una ballena con colateral
   * depositado antes de que pida préstamos de distinto tamaño—. Sin esto, cada
   * escenario lo rehace desde cero y paga el costo completo.
   *
   * Va contra un snapshot propio, no contra el base: así lo que la preparación
   * le hace al mundo no se filtra a los demás vectores. Depositar colateral,
   * sin ir más lejos, mueve las tasas del pool, y otro vector que dependiera de
   * esas tasas mediría un mundo distinto del que el usuario tiene.
   */
  async prepare(setup: () => Promise<void>): Promise<void> {
    this.assertReady()
    if (this.pristineSnapshot) {
      throw new Error('A setup is already active: call releasePrepared() first.')
    }
    this.pristineSnapshot = this.baseSnapshot
    await setup()
    this.baseSnapshot = await testClient.snapshot()
  }

  /** Descarta la preparación y vuelve al mundo limpio. */
  async releasePrepared(): Promise<void> {
    if (!this.pristineSnapshot) return
    this.baseSnapshot = this.pristineSnapshot
    this.pristineSnapshot = null
    await this.revertToBase()
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

    // El revert va en finally: si una mutación falla a mitad de camino, el mundo
    // queda con el oráculo ya manipulado y el escenario siguiente mediría sobre
    // un estado contaminado, produciendo un health factor que no corresponde a
    // lo que dice haber probado.
    try {
      for (const m of mutations) await applyMutation(m)
      const state = await readPosition(this.user!)

      return { state, verdict: verdictOf(state.healthFactor) }
    } finally {
      await this.revertToBase()
    }
  }

  /** Atajo para el vector más común: un shock de precio sobre el colateral. */
  async runPriceShock(pct: number): Promise<ScenarioResult> {
    return this.run([{ type: 'priceShock', asset: 'WETH', pct }])
  }

  private async revertToBase(): Promise<void> {
    // Anvil devuelve false si el snapshot ya fue consumido o no existe. Si eso
    // pasa y seguimos, el estado mutado se convierte en la nueva base y todos
    // los escenarios posteriores miden sobre un mundo roto: preferimos romper
    // ruidosamente antes que devolver números que no significan nada.
    // Se llama al RPC directo en vez de testClient.revert() porque el helper de
    // viem devuelve void y descarta justamente el booleano que nos interesa.
    const reverted = (await testClient.request({
      method: 'evm_revert',
      params: [this.baseSnapshot!],
    } as never)) as unknown as boolean

    if (reverted !== true) {
      this.baseSnapshot = null
      throw new Error(
        'Reverting the fork failed: the state is contaminated. Restart the attack.',
      )
    }

    // Un revert consume el snapshot en Anvil: hay que tomar uno nuevo.
    this.baseSnapshot = await testClient.snapshot()
    // Los mocks deployados después del snapshot dejaron de existir.
    forgetInstalledFeeds()
  }

  private assertReady(): void {
    if (!this.user || !this.baseSnapshot) {
      throw new Error('ScenarioEngine not initialised: call setup() first')
    }
  }
}
