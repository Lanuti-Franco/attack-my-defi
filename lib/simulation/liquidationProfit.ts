import { ASSETS, type AssetSymbol } from '../chain/addresses'
import { readReserveConfig } from '../chain/aave'

/**
 * Cuánto se lleva quien liquida una posición gracias a un precio manipulado.
 *
 * Es lo que distingue una manipulación de oráculo de un crash real. En un crash,
 * el liquidador compra colateral que efectivamente vale menos. Si en cambio sólo
 * mintió el feed, el mercado sigue pagando el precio de antes: el liquidador
 * recibe colateral valuado barato y lo vende caro. Esa diferencia es su ganancia,
 * y por lo tanto su incentivo para corromper el oráculo.
 */
export interface AttackerProfit {
  debtRepaidUsd: number
  /** Unidades de colateral, no dólares. */
  collateralSeized: number
  collateralMarketValueUsd: number
  profitUsd: number
  /** El que publica Aave, en fracción. */
  liquidationBonus: number
  /** El colateral no alcanzaba para pagar el bonus completo. */
  cappedByCollateral: boolean
}

/**
 * Aave deja repagar como máximo la mitad de la deuda mientras el health factor
 * esté por encima de 0.95; por debajo permite el 100%.
 */
function closeFactor(healthFactor: number): number {
  return healthFactor < 0.95 ? 1 : 0.5
}

export async function computeAttackerProfit(params: {
  collateralAsset: AssetSymbol
  debtUsd: number
  /** Al precio real de mercado, no al del oráculo. */
  collateralUsd: number
  /** El que resulta del precio manipulado. */
  healthFactor: number
  manipulatedPrice: number
  marketPrice: number
}): Promise<AttackerProfit | null> {
  // Aave no permite liquidar una posición sana: sin eso, no hay ataque que valga.
  if (params.healthFactor >= 1) return null

  // Un precio de cero o negativo no es un escenario, es una división por cero
  // disfrazada de hallazgo financiero.
  if (!(params.manipulatedPrice > 0) || !(params.marketPrice > 0)) return null

  const { liquidationBonus } = await readReserveConfig(ASSETS[params.collateralAsset].address)

  const debtRepaidUsd = params.debtUsd * closeFactor(params.healthFactor)

  // El liquidador recibe colateral por el valor repagado más el bonus, contado
  // al precio que reporta el oráculo — que es justamente el precio mentido.
  const wantedValueAtOracle = debtRepaidUsd * (1 + liquidationBonus)

  // Pero no puede llevarse más colateral del que la posición tiene. Sin este
  // tope, un precio muy manipulado produce un atacante que se lleva más
  // colateral del que existe y una ganancia inventada.
  const availableUnits = params.collateralUsd / params.marketPrice
  const wantedUnits = wantedValueAtOracle / params.manipulatedPrice
  const collateralSeized = Math.min(wantedUnits, availableUnits)
  const cappedByCollateral = wantedUnits > availableUnits

  // Lo vende en el mercado, que nunca se movió.
  const collateralMarketValueUsd = collateralSeized * params.marketPrice

  // Si el colateral no alcanzó, el liquidador sólo repaga la parte que puede
  // cubrir: no regala deuda a cambio de nada.
  const effectiveDebtRepaid = cappedByCollateral
    ? (collateralSeized * params.manipulatedPrice) / (1 + liquidationBonus)
    : debtRepaidUsd

  return {
    debtRepaidUsd: effectiveDebtRepaid,
    collateralSeized,
    collateralMarketValueUsd,
    profitUsd: collateralMarketValueUsd - effectiveDebtRepaid,
    liquidationBonus,
    cappedByCollateral,
  }
}
