/**
 * Cuánto hunde el precio de WETH venderlo de golpe, medido contra los pools de
 * Uniswap V3 del bloque pineado.
 *
 * Generado por `pnpm impact-curve`. No editar a mano: si cambia el bloque,
 * volver a correrlo.
 *
 * Vive como tabla y no como cotización en vivo porque el bloque está congelado
 * —la curva es la misma en cada corrida— y cotizar cuesta minutos la primera
 * vez. Los números salen igual de los pools reales; lo único que cambia es
 * cuándo se leyeron.
 */
export const IMPACT_CURVE_BLOCK = 25811403n

export const IMPACT_CURVE: readonly { amount: number; slippage: number }[] = [
  { amount: 100, slippage: 0.001734 },
  { amount: 250, slippage: 0.003578 },
  { amount: 500, slippage: 0.006628 },
  { amount: 1000, slippage: 0.012658 },
  { amount: 1500, slippage: 0.018623 },
  { amount: 2000, slippage: 0.024689 },
  { amount: 3000, slippage: 0.037148 },
  { amount: 4000, slippage: 0.050416 },
  { amount: 5000, slippage: 0.060283 },
  { amount: 6500, slippage: 0.071655 },
  { amount: 8000, slippage: 0.080933 },
  { amount: 10000, slippage: 0.091597 },
  { amount: 12500, slippage: 0.10341 },
  { amount: 15000, slippage: 0.113897 },
  { amount: 17500, slippage: 0.123321 },
  { amount: 20000, slippage: 0.132028 },
  { amount: 22500, slippage: 0.140221 },
  { amount: 25000, slippage: 0.148559 },
]

/**
 * Cuánto cae el precio si se vende esa cantidad de golpe, según la curva.
 *
 * Interpola linealmente entre los puntos medidos. Entre dos puntos vecinos la
 * curva es casi recta —por eso están más juntos abajo, que es donde se dobla—,
 * así que la recta local no agrega error apreciable.
 *
 * Por encima del último punto medido no se inventa nada: se devuelve el último
 * valor conocido. Extrapolar una curva de liquidez es exactamente el tipo de
 * número que este proyecto no produce.
 */
export function slippageForSale(amount: number): number {
  if (amount <= 0) return 0

  const first = IMPACT_CURVE[0]
  if (amount <= first.amount) {
    // Por debajo del primer punto se interpola contra el origen: vender cero no
    // mueve el precio.
    return (amount / first.amount) * first.slippage
  }

  for (let i = 1; i < IMPACT_CURVE.length; i++) {
    const prev = IMPACT_CURVE[i - 1]
    const next = IMPACT_CURVE[i]
    if (amount <= next.amount) {
      const t = (amount - prev.amount) / (next.amount - prev.amount)
      return prev.slippage + t * (next.slippage - prev.slippage)
    }
  }

  return IMPACT_CURVE[IMPACT_CURVE.length - 1].slippage
}
