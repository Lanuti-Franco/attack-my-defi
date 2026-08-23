import type { Mutation } from './mutations'
import type { Strategy } from '../schemas/strategy'
import { ASSETS, type AssetSymbol } from '../chain/addresses'

/**
 * Perfiles de aversión al riesgo, anclados en cosas que efectivamente pasaron.
 *
 * La pregunta que responde cada uno no es "¿cuánto puede caer el precio?" sino
 * "¿a qué querés sobrevivir?". Un número inventado no significa nada; un evento
 * con fecha sí: o tu posición lo habría aguantado o no.
 */
export interface RiskProfile {
  id: 'degen' | 'moderado' | 'conservador'
  label: string
  /**
   * El evento contra el que se mide. Recibe el colateral porque el escenario se
   * aplica a lo que la posición tenga: decir "ETH −20%" cuando el colateral es
   * BTC nombra un activo que no participa.
   */
  benchmark(collateral: AssetSymbol): string
  /** Qué le pasa al mundo en ese escenario. */
  scenario(strategy: Strategy): Mutation[]
  /** Caída del colateral que implica el escenario, para el cálculo analítico. */
  collateralDrop: number
}

/**
 * Los tres eventos están elegidos por severidad creciente y son verificables:
 * el 12 de marzo de 2020 ETH perdió cerca de la mitad de su valor en un día, el
 * 19 de mayo de 2021 cayó alrededor de un tercio, y una caída del 20% es
 * simplemente un mal día en cripto. Las fechas son de ETH, pero la magnitud
 * sirve igual como vara para cualquier colateral volátil.
 */
/**
 * Cómo se nombra cada escenario según el colateral.
 *
 * Las fechas son de ETH y sólo se citan para colateral volátil: un USDC
 * cayendo un tercio no es "un crash como el de mayo de 2021", es un depeg que
 * nunca ocurrió. La magnitud sigue sirviendo como vara; la comparación
 * histórica, no.
 */
function describe(asset: AssetSymbol, drop: number, event: string, when?: string): string {
  const { label, stable } = ASSETS[asset]
  if (stable) return `a ${drop}% depeg of ${label}`
  return when ? `${event} (${label} −${drop}%, like ${when})` : `${event} (${label} −${drop}%)`
}

export const RISK_PROFILES: RiskProfile[] = [
  {
    id: 'degen',
    label: 'Degen',
    benchmark: (asset) => describe(asset, 20, 'a bad day'),
    scenario: (s) => [{ type: 'priceShock', asset: s.collateral.asset, pct: -20 }],
    collateralDrop: 0.2,
  },
  {
    id: 'moderado',
    label: 'Moderate',
    benchmark: (asset) => describe(asset, 35, 'a crash', '19 May 2021'),
    scenario: (s) => [{ type: 'priceShock', asset: s.collateral.asset, pct: -35 }],
    collateralDrop: 0.35,
  },
  {
    id: 'conservador',
    label: 'Conservative',
    benchmark: (asset) => describe(asset, 50, 'a collapse', 'Black Thursday 2020'),
    scenario: (s) => [{ type: 'priceShock', asset: s.collateral.asset, pct: -50 }],
    collateralDrop: 0.5,
  },
]

/**
 * Margen sobre el umbral de liquidación.
 *
 * Recomendar la deuda que deja el health factor exactamente en 1 es recomendar
 * el borde del precipicio: con un centavo más de caída te liquidan igual. El
 * colchón hace que la recomendación signifique "sobrevivís esto", no "sobrevivís
 * esto y nada más".
 */
export const SAFETY_MARGIN = 1.05

export interface Recommendation {
  profile: RiskProfile
  /** Deuda máxima en USD que sobrevive el escenario del perfil. */
  maxDebtUsd: number
  /** Cuánto habría que repagar para llegar ahí. Cero si ya está bien. */
  repayUsd: number
  /** true si la posición actual ya sobrevive este escenario. */
  alreadySafe: boolean
  /** Health factor que tendría la posición ajustada bajo ese escenario. */
  resultingHealthFactor: number
}

/**
 * Deuda máxima que sobrevive un escenario, despejada de la fórmula de Aave.
 *
 *     HF = (colateral × (1 − caída) × liquidationThreshold) / deuda ≥ margen
 *     ⇒ deuda ≤ colateral × (1 − caída) × liquidationThreshold / margen
 *
 * Se calcula en vez de buscarse por simulación porque es una despejada exacta,
 * no una estimación. La verificación de que da lo prometido se hace después,
 * simulando la posición ajustada contra el escenario real.
 */
export function recommendFor(params: {
  profile: RiskProfile
  collateralUsd: number
  debtUsd: number
  liquidationThreshold: number
}): Recommendation {
  const { profile, collateralUsd, debtUsd, liquidationThreshold } = params

  const survivingCollateral = collateralUsd * (1 - profile.collateralDrop)
  const maxDebtUsd = (survivingCollateral * liquidationThreshold) / SAFETY_MARGIN

  const repayUsd = Math.max(0, debtUsd - maxDebtUsd)
  const alreadySafe = repayUsd === 0

  const finalDebt = alreadySafe ? debtUsd : maxDebtUsd
  const resultingHealthFactor = (survivingCollateral * liquidationThreshold) / finalDebt

  return { profile, maxDebtUsd, repayUsd, alreadySafe, resultingHealthFactor }
}
