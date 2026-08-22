import type { Address } from 'viem'
import { ADDRESSES, type AssetSymbol } from '../chain/addresses'
import { readAssetPrice } from '../chain/aave'
import { installMockFeed, setAssetPrice } from './oracle'
import { testClient } from '../chain/client'
import { lowerLiquidationThreshold } from './riskParams'
import { drainLiquidity } from './liquidityDrain'

/**
 * Una mutación es un cambio de estado del mundo que aplicamos al fork antes de
 * preguntarle a los protocolos qué pasó. Todos los vectores de ataque se expresan
 * como listas de mutaciones; por eso agregar depeg u oráculo no toca el motor.
 */
export type Mutation =
  /** Mueve el precio de un activo un porcentaje (-25 = cae 25%) */
  | { type: 'priceShock'; asset: AssetSymbol; pct: number }
  /** Fija el precio de un activo en un valor absoluto en USD (depeg: USDC a 0.92) */
  | { type: 'priceSet'; asset: AssetSymbol; usd: number }
  /** Adelanta el reloj del fork: la deuda crece por el interés variable */
  | { type: 'advanceTime'; days: number }
  /** Governance le baja el umbral de liquidación al colateral, en puntos */
  | { type: 'lowerThreshold'; asset: AssetSymbol; points: number }
  /** Una ballena consume liquidez del pool y dispara la tasa variable */
  | { type: 'drainLiquidity'; asset: AssetSymbol; pct: number; alreadyFunded?: boolean }

export function assetAddress(asset: AssetSymbol): Address {
  return asset === 'WETH' ? ADDRESSES.weth : ADDRESSES.usdc
}

/** Descripción legible, para el feed del ataque en la UI. */
export function describeMutation(m: Mutation): string {
  switch (m.type) {
    case 'priceShock':
      return `${m.asset} ${m.pct > 0 ? '+' : ''}${m.pct}%`
    case 'priceSet':
      return `${m.asset} a $${m.usd}`
    case 'advanceTime':
      return `+${Math.round(m.days)} días`
    case 'lowerThreshold':
      return `LT de ${m.asset} −${m.points.toFixed(1)} pts`
    case 'drainLiquidity':
      return `se va el ${m.pct.toFixed(0)}% de la liquidez`
  }
}

/** Aplica una mutación sobre el fork. Idempotente respecto del snapshot base. */
export async function applyMutation(m: Mutation): Promise<void> {
  // Adelantar el reloj no toca precios: la deuda crece sola por el interés que
  // Aave acumula. El snapshot también guarda el timestamp, así que el revert
  // devuelve el reloj junto con el resto del estado.
  if (m.type === 'advanceTime') {
    await testClient.increaseTime({ seconds: Math.round(m.days * 24 * 60 * 60) })
    await testClient.mine({ blocks: 1 })
    return
  }

  // Cambiar parámetros de riesgo tampoco toca precios: el mercado queda igual y
  // lo que se mueve es la regla con la que Aave mide la posición.
  if (m.type === 'lowerThreshold') {
    await lowerLiquidationThreshold(assetAddress(m.asset), m.points)
    return
  }

  // Consumir liquidez tampoco toca precios: sube la utilización del pool, y con
  // ella la tasa variable a la que crece la deuda.
  if (m.type === 'drainLiquidity') {
    await drainLiquidity(m.asset, m.pct, { alreadyFunded: m.alreadyFunded })
    return
  }

  const addr = assetAddress(m.asset)
  await installMockFeed(addr)

  switch (m.type) {
    case 'priceShock': {
      const base = basePriceOf(addr)
      await setAssetPrice(addr, base * (1 + m.pct / 100))
      return
    }
    case 'priceSet': {
      await setAssetPrice(addr, m.usd)
      return
    }
  }
}

/**
 * Precios de referencia: lo que valía cada activo con el mundo intacto.
 *
 * Se capturan una sola vez, antes de que exista ningún mock, y de ahí en más un
 * shock del -25% siempre parte del mismo número. Leerlos perezosamente sería un
 * error sutil: si un escenario fija primero el precio de un activo y después le
 * aplica un shock, el "precio base" que leería sería el ya manipulado, y el
 * resultado no correspondería a lo que el escenario dice estar probando.
 */
const basePrices = new Map<Address, number>()

/** Captura los precios de referencia. Llamar con el fork recién armado. */
export async function captureBasePrices(assets: AssetSymbol[]): Promise<void> {
  for (const asset of assets) {
    const addr = assetAddress(asset)
    basePrices.set(addr, await readAssetPrice(addr))
  }
}

export function basePriceOf(asset: Address): number {
  const cached = basePrices.get(asset)
  if (cached === undefined) {
    throw new Error(
      `No hay precio de referencia para ${asset}. captureBasePrices() tiene que correr ` +
        'con el fork intacto, antes de aplicar cualquier mutación.',
    )
  }
  return cached
}

export function resetBasePrices(): void {
  basePrices.clear()
}
