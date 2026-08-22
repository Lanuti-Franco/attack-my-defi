import type { Mutation } from '../simulation/mutations'
import type { Strategy } from '../schemas/strategy'
import type { AssetSymbol } from '../chain/addresses'
import { fundWhale } from '../simulation/liquidityDrain'

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
  /** Marca los vectores donde el precio de mercado no acompaña al del oráculo. */
  isOracleManipulation?: boolean
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

export type VectorId =
  | 'price'
  | 'depeg'
  | 'oracle'
  | 'time'
  | 'governance'
  | 'liquidity'
  | 'cascade'

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
    survivedMessage:
      'Ni una caída del 80% la liquida. Tu colateral cubre la deuda con muchísimo margen.',
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
    survivedMessage: `Ni triplicando el precio de ${debtAsset} te liquidan.`,
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
    label: 'Depeg de USDC',
    premise: 'USDC pierde el peg y tu colateral se evapora, como en marzo de 2023.',
    mutate: (usd) => [{ type: 'priceSet', asset: 'USDC', usd }],
    bounds: { safe: 1, extreme: 0.5 },
    scale: 'absolute',
    format: (usd) => `USDC a $${usd.toFixed(3)}`,
    briefing:
      'You are looking for the smallest USDC price drop below its $1 peg that makes the position ' +
      'liquidatable. The collateral is USDC, so a cheaper USDC means less collateral value.',
    paramName: 'usdc_price',
    paramDescription: 'USDC price in USD. 1.0 is the peg. 0.9 means USDC trades 10% below peg.',
    survivedMessage:
      'Aguantás un USDC a 50 centavos, mucho peor que el mínimo histórico de $0,87 en marzo de 2023.',
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
    survivedMessage:
      'Ni un feed reportando un 80% de menos te liquida: estás fuera del alcance de un fallo de oráculo.',
    targetAsset: asset,
    isOracleManipulation: true,
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
    label: 'El paso del tiempo',
    premise: 'Nadie ataca y el precio no se mueve: tu deuda crece sola por el interés.',
    mutate: (days) => [{ type: 'advanceTime', days }],
    bounds: { safe: 0, extreme: 3650 },
    scale: 'percent',
    format: (days) => {
      const d = Math.round(days)
      if (d < 60) return `+${d} días`
      const months = d / 30.44
      return months < 24 ? `+${months.toFixed(1)} meses` : `+${(d / 365.25).toFixed(1)} años`
    },
    briefing:
      'You are looking for how long it takes until the position becomes liquidatable on its own, ' +
      'with no price movement at all. The debt grows because of the variable borrow rate. ' +
      'Test a number of days.',
    formatForModel: (days) => `${Math.round(days)} days`,
    paramName: 'days',
    paramDescription: 'How many days to let pass. 365 means one year.',
    survivedMessage:
      'Ni en diez años el interés te alcanza. Tu deuda crece más lento de lo que tu colchón aguanta.',
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
    label: 'Un voto de governance',
    premise: `Aave le baja el umbral de liquidación al ${asset} y tu posición pasa a liquidable sin que el mercado se mueva.`,
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
      'Aguantás que Aave te recorte 40 puntos el umbral, un ajuste mucho mayor que cualquiera que haya hecho.',
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
    label: 'Una corrida de liquidez',
    premise: `El pool de ${asset} se vacía, la tasa se dispara y tu deuda crece mucho más rápido.`,
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
    format: (pct) => `${pct.toFixed(0)}% de la liquidez`,
    formatForModel: (pct) => `${pct.toFixed(0)} percent`,
    briefing:
      `You are looking for the smallest fraction of the ${asset} pool liquidity that has to be ` +
      `borrowed away for the position to become liquidatable within one year. Draining liquidity ` +
      `raises the variable borrow rate, which makes the debt grow faster.`,
    paramName: 'liquidity_drained_pct',
    paramDescription:
      'What percentage of the available pool liquidity gets borrowed away. 90 means 90% of it.',
    survivedMessage:
      'Aunque se lleven casi toda la liquidez del pool, el interés no te alcanza dentro del año.',
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
    label: 'Una cascada de liquidaciones',
    premise: 'Liquidan a otro, su colateral se vende al mercado y el precio te arrastra a vos.',
    mutate: (amount) => [{ type: 'marketSale', asset: 'WETH', amount }],
    bounds: { safe: 0, extreme: 5000 },
    scale: 'percent',
    format: (amount) => `liquidan ${Math.round(amount)} WETH`,
    formatForModel: (amount) => `${Math.round(amount)} WETH`,
    briefing:
      'You are looking for the smallest liquidation, measured in WETH sold into the market, that ' +
      'pushes the price down enough to make this position liquidatable too. The sale is quoted ' +
      'against real Uniswap V3 pools.',
    paramName: 'weth_liquidated',
    paramDescription: 'How much WETH gets liquidated and sold into the market, in whole WETH.',
    survivedMessage:
      'El mercado no tiene profundidad para arrastrarte: ni vendiendo 5.000 WETH de golpe el precio se mueve lo suficiente.',
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
    oracleManipulation(strategy),
    timeDecay(),
    governanceRiskChange(strategy),
    liquidityCrisis(strategy),
    ...(cascade ? [cascade] : []),
  ]
}

export function vectorById(strategy: Strategy, id: VectorId): AttackVector | undefined {
  return vectorsFor(strategy).find((v) => v.id === id)
}
