import { z } from 'zod'

export const assetSchema = z.enum(['WETH', 'USDC'])

const legSchema = z.object({
  asset: assetSchema,
  amount: z.number().positive('El monto tiene que ser mayor que cero'),
})

/** Estrategia que el usuario quiere poner a prueba. */
export const strategySchema = z
  .object({
    collateral: legSchema,
    debt: legSchema,
  })
  .refine((s) => s.collateral.asset !== s.debt.asset, {
    message: 'Depositar y pedir prestado el mismo activo no arma una posición atacable',
  })

export type Strategy = z.infer<typeof strategySchema>

/** Estrategia por defecto: la posición de referencia contra la que se validó todo. */
export const DEFAULT_STRATEGY: Strategy = {
  collateral: { asset: 'WETH', amount: 100 },
  debt: { asset: 'USDC', amount: 150_000 },
}

/** Eventos que emite el ataque, para el feed en vivo. */
export type AttackEvent =
  | {
      type: 'position'
      collateralUsd: number
      debtUsd: number
      healthFactor: number
      liquidationThreshold: number
    }
  | { type: 'thinking'; text: string }
  | {
      type: 'attempt'
      /** El escenario ya formateado por el vector: "ETH -25.0%", "USDC a $1.150". */
      label: string
      /** El valor crudo que se probó, en las unidades del vector. */
      intensity: number
      healthFactor: number
      verdict: 'SURVIVED' | 'LIQUIDATABLE'
      collateralUsd: number
    }
  | {
      type: 'conclusion'
      vectorLabel: string
      /** El umbral encontrado, o null si nada liquidó la posición. */
      threshold: number | null
      thresholdLabel: string | null
      /** Sólo para el vector de oráculo: lo que se lleva el atacante. */
      attackerProfitUsd?: number
      text: string
    }
  | { type: 'error'; message: string }
