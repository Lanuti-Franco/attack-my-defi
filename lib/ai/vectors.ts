import type { Mutation } from '../simulation/mutations'
import type { Strategy } from '../schemas/strategy'
import type { AssetSymbol } from '../chain/addresses'
import { fundWhale } from '../simulation/liquidityDrain'
import { ASSETS } from '@/lib/chain/addresses'

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
  /** Cómo se muestra en la UI: pensado para que lo lea una persona. */
  format(intensity: number): string
  /**
   * Cómo se le nombra un valor al modelo, en las unidades del parámetro que
   * completa. Separado de `format` porque no son lo mismo: mostrar "+10 años"
   * cuando el parámetro se mide en días hace que el modelo mande 10.
   */
  formatForModel?(intensity: number): string
  /** Qué le decimos al modelo que está buscando. */
  briefing: string
  paramName: string
  paramDescription: string
  /** El activo cuyo precio mueve este vector, si mueve alguno. */
  targetAsset?: AssetSymbol
  /**
   * Reporta cuánto se lleva quien liquida si la caída vino de un feed que
   * mintió en vez del mercado. Sólo tiene sentido donde el precio del colateral
   * es lo que se mueve.
   */
  reportsOracleProfit?: boolean
  /**
   * Trabajo caro que hace falta una vez por vector y no cambia entre escenarios.
   * Corre contra un snapshot propio, así no contamina a los demás vectores.
   */
  prepare?: () => Promise<void>
  /**
   * Qué significa que este vector no haya podido liquidar la posición.
   *
   * "No encontré ningún escenario" desperdicia el resultado: que un ataque no
   * llegue a matarte es información, y a veces la más valiosa del informe.
   */
  survivedMessage: string
}

export type VectorId = 'price' | 'depeg' | 'time' | 'governance' | 'liquidity' | 'cascade'

/**
 * Movimiento adverso del activo volátil.
 *
 * Cuál es el activo volátil depende de la posición: si el colateral se mueve
 * —ETH, BTC—, el daño viene de que caiga. Si el colateral es una stablecoin no
 * se mueve, y el riesgo pasa a ser que se encarezca la deuda. Apuntar siempre
 * al colateral haría que este vector fuera idéntico al depeg cuando el
 * colateral es USDC, o sea el mismo ataque contado dos veces.
 */
function priceCrash(strategy: Strategy): AttackVector {
  const collateral = strategy.collateral.asset
  const { label, stable } = ASSETS[collateral]

  if (!stable) {
    return {
      id: 'price',
      label: `${label} crash`,
      premise:
        'The price Aave uses for your collateral drops, whether the market fell or the feed failed.',
      mutate: (pct) => [{ type: 'priceShock', asset: collateral, pct }],
      bounds: { safe: 0, extreme: -80 },
      scale: 'percent',
      format: (pct) => `${label} ${pct.toFixed(1)}%`,
      briefing: `You are looking for the smallest ${label} price drop that makes the position liquidatable.`,
      paramName: 'drop_pct',
      paramDescription: `${label} price change in percent. Negative: -25 means ${label} drops 25%.`,
      survivedMessage:
        'Not even an 80% crash liquidates it. Your collateral covers the debt with room to spare.',
      targetAsset: collateral,
      reportsOracleProfit: true,
    }
  }

  const debtAsset = strategy.debt.asset
  return {
    id: 'price',
    label: `${debtAsset} spike`,
    premise: `${debtAsset} spikes and your debt grows faster than your collateral.`,
    mutate: (pct) => [{ type: 'priceShock', asset: debtAsset, pct }],
    bounds: { safe: 0, extreme: 200 },
    scale: 'percent',
    format: (pct) => `${debtAsset} +${pct.toFixed(1)}%`,
    briefing: `You are looking for the smallest ${debtAsset} price increase that makes the position liquidatable. The debt is denominated in ${debtAsset}, so a more expensive ${debtAsset} means a larger debt.`,
    paramName: 'rise_pct',
    paramDescription: `${debtAsset} price change in percent. Positive: 25 means it rises 25%.`,
    survivedMessage: `Not even tripling the price of ${debtAsset} liquidates you.`,
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
  // Sólo cuando la stablecoin es el colateral. Si es la deuda, el escenario que
  // lastima es que USDC se aprecie, y una stablecoin apreciándose un 12% no es
  // un riesgo que alguien esté evaluando: mostrarlo gasta la atención del
  // usuario en algo que no va a pasar.
  if (strategy.collateral.asset !== 'USDC') return null

  return {
    id: 'depeg',
    label: 'USDC depeg',
    premise: 'USDC loses its peg and your collateral evaporates, like in March 2023.',
    mutate: (usd) => [{ type: 'priceSet', asset: 'USDC', usd }],
    bounds: { safe: 1, extreme: 0.5 },
    scale: 'absolute',
    format: (usd) => `USDC at $${usd.toFixed(3)}`,
    briefing:
      'You are looking for the smallest USDC price drop below its $1 peg that makes the position ' +
      'liquidatable. The collateral is USDC, so a cheaper USDC means less collateral value.',
    paramName: 'usdc_price',
    paramDescription: 'USDC price in USD. 1.0 is the peg. 0.9 means USDC trades 10% below peg.',
    survivedMessage:
      'You survive USDC at 50 cents, far worse than its all-time low of $0.87 in March 2023.',
    targetAsset: 'USDC',
  }
}

/**
 * El paso del tiempo.
 *
 * No hace falta que el mercado se mueva ni que nadie ataque: la deuda a tasa
 * variable crece sola, y una posición que arranca cerca del umbral se liquida
 * por su propio interés. Es el riesgo que nadie mira porque no pasa nada.
 *
 * La tasa que se aplica es la que regía en el bloque pineado. En la vida real
 * varía con la utilización del pool, así que el horizonte es una estimación con
 * la tasa congelada, no una predicción.
 */
function timeDecay(): AttackVector {
  return {
    id: 'time',
    label: 'Time passing',
    premise: 'Nobody attacks and the price holds: your debt grows on its own, from interest.',
    mutate: (days) => [{ type: 'advanceTime', days }],
    bounds: { safe: 0, extreme: 3650 },
    scale: 'percent',
    format: (days) => {
      const d = Math.round(days)
      if (d < 60) return `+${d} days`
      const months = d / 30.44
      return months < 24 ? `+${months.toFixed(1)} months` : `+${(d / 365.25).toFixed(1)} years`
    },
    briefing:
      'You are looking for how long it takes until the position becomes liquidatable on its own, ' +
      'with no price movement at all. The debt grows because of the variable borrow rate. ' +
      'Test a number of days.',
    formatForModel: (days) => `${Math.round(days)} days`,
    paramName: 'days',
    paramDescription: 'How many days to let pass. 365 means one year.',
    survivedMessage:
      'Ten years of interest still is not enough. Your debt grows slower than your cushion can take.',
  }
}

/**
 * Un voto de governance.
 *
 * Aave ajusta los parámetros de riesgo de sus activos con cierta regularidad.
 * Bajarle el umbral de liquidación a un colateral vuelve liquidables posiciones
 * que no se movieron: es el único vector donde el mercado queda intacto y lo que
 * cambia es la regla con la que se te mide.
 */
function governanceRiskChange(strategy: Strategy): AttackVector {
  const asset = strategy.collateral.asset
  return {
    id: 'governance',
    label: 'A governance vote',
    premise: `Aave lowers the liquidation threshold on ${asset} and your position becomes liquidatable without the market moving at all.`,
    mutate: (points) => [{ type: 'lowerThreshold', asset, points }],
    bounds: { safe: 0, extreme: 40 },
    scale: 'percent',
    format: (points) => `LT −${points.toFixed(1)} pts`,
    formatForModel: (points) => `${points.toFixed(1)} percentage points`,
    briefing:
      `You are looking for the smallest reduction of the ${asset} liquidation threshold that makes ` +
      'the position liquidatable. Nothing else changes: no price moves. Aave governance simply ' +
      'lowers how much it is willing to lend against this collateral.',
    paramName: 'threshold_drop_points',
    paramDescription:
      'How many percentage points to lower the liquidation threshold by. 5 means it goes from 83% to 78%.',
    survivedMessage:
      'You survive Aave cutting the threshold by 40 points, a far bigger adjustment than any it has ever made.',
    targetAsset: asset,
  }
}

/** Horizonte fijo del vector de liquidez: la crisis se mide sobre un año. */
const LIQUIDITY_HORIZON_DAYS = 365

/**
 * Una corrida de liquidez.
 *
 * Que el pool se quede sin fondos no te liquida por sí solo: te acelera el
 * reloj. Cuando la utilización sube, la tasa variable se dispara y la deuda
 * empieza a crecer mucho más rápido. Este vector busca cuánta liquidez tiene que
 * irse para que el interés te alcance dentro del año.
 *
 * Se consume la liquidez pidiéndola prestada, que es como se consume de verdad.
 * Sacarle los tokens al aToken no sirve: Aave V3 lleva contabilidad virtual del
 * underlying y no se entera.
 */
function liquidityCrisis(strategy: Strategy): AttackVector {
  const asset = strategy.debt.asset
  return {
    id: 'liquidity',
    label: 'A liquidity run',
    premise: `The ${asset} pool drains, the rate spikes and your debt grows much faster.`,
    // La ballena queda con el colateral ya depositado antes del primer escenario:
    // envolver y depositar 400.000 WETH es la parte cara y no cambia entre
    // escenarios, sólo cambia cuánto pide prestado.
    prepare: fundWhale,
    mutate: (pct) => [
      { type: 'drainLiquidity', asset, pct, alreadyFunded: true },
      { type: 'advanceTime', days: LIQUIDITY_HORIZON_DAYS },
    ],
    bounds: { safe: 0, extreme: 99 },
    scale: 'percent',
    format: (pct) => `${pct.toFixed(0)}% of liquidity`,
    formatForModel: (pct) => `${pct.toFixed(0)} percent`,
    briefing:
      `You are looking for the smallest fraction of the ${asset} pool liquidity that has to be ` +
      `borrowed away for the position to become liquidatable within one year. Draining liquidity ` +
      `raises the variable borrow rate, which makes the debt grow faster.`,
    paramName: 'liquidity_drained_pct',
    paramDescription:
      'What percentage of the available pool liquidity gets borrowed away. 90 means 90% of it.',
    survivedMessage:
      'Even if almost all the pool liquidity is drained, the interest does not catch you within a year.',
    targetAsset: asset,
  }
}

/**
 * Una cascada de liquidaciones.
 *
 * Cuando liquidan una posición grande, el liquidador no se queda el colateral:
 * lo vende. Esa venta empuja el precio hacia abajo, y ese empujón puede volver
 * liquidable a la posición siguiente, que a su vez se vende. Así se propagan los
 * eventos de liquidación en cadena.
 *
 * El impacto de precio no se estima con una curva inventada: se cotiza contra
 * los pools reales de Uniswap V3 en el fork. La profundidad del mercado es un
 * dato, y en ese dato está la respuesta — el mercado absorbe mil WETH moviendo
 * el precio poco más de un punto, y no absorbe diez mil a ningún precio.
 *
 * Sólo aplica cuando el colateral es volátil: nadie hunde el precio de una
 * stablecoin vendiéndola en Uniswap.
 */
function liquidationCascade(strategy: Strategy): AttackVector | null {
  if (strategy.collateral.asset !== 'WETH') return null

  return {
    id: 'cascade',
    label: 'A liquidation cascade',
    premise: 'Someone else gets liquidated, their collateral is dumped on the market, and the price drags you down with it.',
    mutate: (amount) => [{ type: 'marketSale', asset: 'WETH', amount }],
    // 25.000 WETH son unos 60 millones de dólares vendidos de golpe: más de lo
    // que liquidó Aave en todo el día de marzo de 2020 o el de mayo de 2021.
    // Arriba de eso ya no es una cascada, es un escenario que nunca ocurrió.
    bounds: { safe: 0, extreme: 25_000 },
    scale: 'percent',
    format: (amount) => `${Math.round(amount)} WETH liquidated`,
    formatForModel: (amount) => `${Math.round(amount)} WETH`,
    briefing:
      'You are looking for the smallest liquidation, measured in WETH sold into the market, that ' +
      'pushes the price down enough to make this position liquidatable too. The sale is quoted ' +
      'against real Uniswap V3 pools.',
    paramName: 'weth_liquidated',
    paramDescription: 'How much WETH gets liquidated and sold into the market, in whole WETH.',
    survivedMessage:
      'Not even 25,000 WETH liquidated at once drags you down: more than Aave liquidated in all of March 2020.',
    targetAsset: 'WETH',
  }
}

/** Los vectores que tienen sentido para una estrategia dada. */
export function vectorsFor(strategy: Strategy): AttackVector[] {
  const depeg = stablecoinDepeg(strategy)
  const cascade = liquidationCascade(strategy)
  return [
    priceCrash(strategy),
    ...(depeg ? [depeg] : []),
    timeDecay(),
    governanceRiskChange(strategy),
    liquidityCrisis(strategy),
    ...(cascade ? [cascade] : []),
  ]
}

export function vectorById(strategy: Strategy, id: VectorId): AttackVector | undefined {
  return vectorsFor(strategy).find((v) => v.id === id)
}
