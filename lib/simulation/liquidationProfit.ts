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
  /** Deuda que el liquidador repaga, en USD */
  debtRepaidUsd: number
  /** Unidades de colateral que se lleva */
  collateralSeized: number
  /** Lo que valen esas unidades al precio real de mercado */
  collateralMarketValueUsd: number
  /** Ganancia neta del atacante */
  profitUsd: number
  /** Bonus de liquidación que publica Aave, en fracción */
  liquidationBonus: number
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
  /** Deuda total de la posición, en USD */
  debtUsd: number
  /** Health factor con el precio manipulado */
  healthFactor: number
  /** Precio del colateral que reporta el oráculo manipulado */
  manipulatedPrice: number
  /** Precio del colateral en el mercado real, sin manipular */
  marketPrice: number
}): Promise<AttackerProfit> {
  const { liquidationBonus } = await readReserveConfig(ASSETS[params.collateralAsset].address)

  const debtRepaidUsd = params.debtUsd * closeFactor(params.healthFactor)

  // El liquidador recibe colateral por el valor repagado más el bonus, contado
  // al precio que reporta el oráculo — que es justamente el precio mentido.
  const collateralValueAtOracle = debtRepaidUsd * (1 + liquidationBonus)
  const collateralSeized = collateralValueAtOracle / params.manipulatedPrice

  // Pero después lo vende en el mercado, que nunca se movió.
  const collateralMarketValueUsd = collateralSeized * params.marketPrice

  return {
    debtRepaidUsd,
    collateralSeized,
    collateralMarketValueUsd,
    profitUsd: collateralMarketValueUsd - debtRepaidUsd,
    liquidationBonus,
  }
}
