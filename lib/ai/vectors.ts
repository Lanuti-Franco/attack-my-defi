import type { Mutation } from '../simulation/mutations'
import type { Strategy } from '../schemas/strategy'
import type { AssetSymbol } from '../chain/addresses'

/**
 * Un vector de ataque es una forma de romper la posición.
 *
 * Los tres comparten el mismo motor —mutar el estado del fork y preguntarle a
 * Aave— y se diferencian en qué mueven, en qué rango tiene sentido buscar y en
 * cómo se le plantea el problema al modelo. Por eso son datos, no tres
 * implementaciones paralelas.
 *
 * Se construyen a partir de la estrategia porque la dirección del ataque depende
 * de ella: un depeg de USDC lastima al que lo tiene de colateral cuando baja, y
 * al que debe en USDC cuando sube.
 */
export interface AttackVector {
  id: VectorId
  label: string
  /** Qué le pasa al mundo, en una línea, para la UI. */
  premise: string
  mutate(intensity: number): Mutation[]
  /** `safe` no rompe nada; `extreme` seguro rompe. */
  bounds: { safe: number; extreme: number }
  /**
   * `percent`: el valor es un cambio porcentual, donde -25 y 25 significan lo
   * mismo y hay que orientar el signo. `absolute`: el valor es un precio, donde
   * el signo no se toca porque 0,75 no es lo mismo que -0,75.
   */
  scale: 'percent' | 'absolute'
  format(intensity: number): string
  /** Qué le decimos al modelo que está buscando. */
  briefing: string
  paramName: string
  paramDescription: string
  /** El activo cuyo precio mueve este vector, si mueve alguno. */
  targetAsset?: AssetSymbol
  /** Marca los vectores donde el precio de mercado no acompaña al del oráculo. */
  isOracleManipulation?: boolean
}

export type VectorId = 'price' | 'depeg' | 'oracle'

/**
 * Movimiento adverso del activo volátil.
 *
 * Cuál es el activo volátil depende de la posición: si el colateral es WETH, el
 * daño viene de que caiga. Si el colateral es una stablecoin, el colateral no se
 * mueve — el riesgo está en que se encarezca la deuda. Apuntar siempre al
 * colateral haría que este vector fuera idéntico al depeg cuando el colateral es
 * USDC, o sea el mismo ataque contado dos veces.
 */
function priceCrash(strategy: Strategy): AttackVector {
  const collateralIsVolatile = strategy.collateral.asset === 'WETH'

  if (collateralIsVolatile) {
    return {
      id: 'price',
      label: 'Caída de ETH',
      premise: 'El mercado se desploma y tu colateral vale menos.',
      mutate: (pct) => [{ type: 'priceShock', asset: 'WETH', pct }],
      bounds: { safe: 0, extreme: -80 },
      scale: 'percent',
      format: (pct) => `ETH ${pct.toFixed(1)}%`,
      briefing:
        'You are looking for the smallest ETH price drop that makes the position liquidatable.',
      paramName: 'drop_pct',
      paramDescription: 'ETH price change in percent. Negative: -25 means ETH drops 25%.',
      targetAsset: 'WETH',
    }
  }

  const debtAsset = strategy.debt.asset
  return {
    id: 'price',
    label: `Suba de ${debtAsset}`,
    premise: `${debtAsset} se dispara y tu deuda crece más rápido que tu colateral.`,
    mutate: (pct) => [{ type: 'priceShock', asset: debtAsset, pct }],
    bounds: { safe: 0, extreme: 200 },
    scale: 'percent',
    format: (pct) => `${debtAsset} +${pct.toFixed(1)}%`,
    briefing: `You are looking for the smallest ${debtAsset} price increase that makes the position liquidatable. The debt is denominated in ${debtAsset}, so a more expensive ${debtAsset} means a larger debt.`,
    paramName: 'rise_pct',
    paramDescription: `${debtAsset} price change in percent. Positive: 25 means it rises 25%.`,
    targetAsset: debtAsset,
  }
}

/**
 * Depeg de la stablecoin involucrada.
 *
 * La dirección peligrosa depende de qué papel cumple. Si es colateral, un depeg
 * a la baja lo evapora — es lo que pasó con USDC en marzo de 2023, cuando tocó
 * $0,87. Si es la deuda, el daño viene de que se aprecie: la deuda crece medida
 * en dólares, que es lo contrario de lo que sugiere la palabra "depeg".
 */
function stablecoinDepeg(strategy: Strategy): AttackVector | null {
  const isCollateral = strategy.collateral.asset === 'USDC'
  const isDebt = strategy.debt.asset === 'USDC'
  if (!isCollateral && !isDebt) return null

  const downward = isCollateral
  return {
    id: 'depeg',
    label: 'Depeg de USDC',
    premise: downward
      ? 'USDC pierde el peg y tu colateral se evapora, como en marzo de 2023.'
      : 'USDC se aprecia y tu deuda crece medida en dólares.',
    mutate: (usd) => [{ type: 'priceSet', asset: 'USDC', usd }],
    bounds: downward ? { safe: 1, extreme: 0.5 } : { safe: 1, extreme: 2 },
    scale: 'absolute',
    format: (usd) => `USDC a $${usd.toFixed(3)}`,
    briefing: downward
      ? 'You are looking for the smallest USDC price drop below its $1 peg that makes the position liquidatable. The collateral is USDC, so a cheaper USDC means less collateral value.'
      : 'You are looking for the smallest USDC price increase above its $1 peg that makes the position liquidatable. The debt is USDC, so a more expensive USDC means a larger debt.',
    paramName: 'usdc_price',
    paramDescription: 'USDC price in USD. 1.0 is the peg. 0.9 means USDC trades 10% below peg.',
    targetAsset: 'USDC',
  }
}

/**
 * Manipulación del oráculo.
 *
 * Mueve el mismo precio que un crash, pero la premisa cambia todo: el mercado no
 * se movió, sólo miente el feed que Aave consulta. Por eso reporta algo que un
 * crash no puede reportar — cuánto se lleva el atacante liquidando a precio
 * falso colateral que sigue valiendo lo de antes.
 */
function oracleManipulation(strategy: Strategy): AttackVector {
  const asset = strategy.collateral.asset
  return {
    id: 'oracle',
    label: 'Manipulación del oráculo',
    premise: `El mercado no se movió: sólo miente el precio de ${asset} que Aave consulta.`,
    mutate: (pct) => [{ type: 'priceShock', asset, pct }],
    bounds: { safe: 0, extreme: -80 },
    scale: 'percent',
    format: (pct) => `feed ${asset} ${pct.toFixed(1)}%`,
    briefing:
      `You are looking for the smallest downward deviation in the ${asset} price feed that makes ` +
      'the position liquidatable. The market price has not moved: only the oracle reports a lower value.',
    paramName: 'deviation_pct',
    paramDescription: `Downward deviation of the reported ${asset} price, in percent. Negative: -25 means the feed reports 25% below market.`,
    targetAsset: asset,
    isOracleManipulation: true,
  }
}

/** Los vectores que tienen sentido para una estrategia dada. */
export function vectorsFor(strategy: Strategy): AttackVector[] {
  const depeg = stablecoinDepeg(strategy)
  return [priceCrash(strategy), ...(depeg ? [depeg] : []), oracleManipulation(strategy)]
}

export function vectorById(strategy: Strategy, id: VectorId): AttackVector | undefined {
  return vectorsFor(strategy).find((v) => v.id === id)
}
