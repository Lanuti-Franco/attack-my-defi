import type { Address } from 'viem'
import { ADDRESSES, type AssetSymbol } from '../chain/addresses'
import { readAssetPrice } from '../chain/aave'
import { installMockFeed, setAssetPrice } from './oracle'

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
  }
}

/** Aplica una mutación sobre el fork. Idempotente respecto del snapshot base. */
export async function applyMutation(m: Mutation): Promise<void> {
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
