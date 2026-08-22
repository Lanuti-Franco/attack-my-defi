import { z } from 'zod'

/** Estrategia que el usuario quiere poner a prueba. */
export const strategySchema = z.object({
  supplyWeth: z
    .number()
    .positive('El colateral tiene que ser mayor que cero')
    .max(5000, 'Más de 5000 WETH no entra en la liquidez del fork'),
  borrowUsdc: z
    .number()
    .nonnegative()
    .max(50_000_000, 'Ese préstamo excede la liquidez de USDC en Aave'),
})

export type Strategy = z.infer<typeof strategySchema>

/** Lo que el atacante pide simular en cada intento. */
export const shockInputSchema = z.object({
  shock_pct: z
    .number()
    .min(-99, 'Un shock de -99% o peor no aporta información')
    .max(0, 'El atacante busca caídas de precio: el shock tiene que ser negativo'),
  reasoning: z.string().optional(),
})

export type ShockInput = z.infer<typeof shockInputSchema>

/** Eventos que emite el ataque, para el feed en vivo. */
export type AttackEvent =
  | { type: 'position'; collateralUsd: number; debtUsd: number; healthFactor: number; liquidationThreshold: number }
  | { type: 'thinking'; text: string }
  | { type: 'attempt'; shockPct: number; healthFactor: number; verdict: 'SURVIVED' | 'LIQUIDATABLE'; collateralUsd: number }
  | { type: 'conclusion'; minimalShockPct: number | null; text: string }
  | { type: 'error'; message: string }
