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
      const base = await basePriceOf(addr)
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
 * Precio de referencia del activo, cacheado en el primer uso.
 * Se cachea para que un shock del -25% siempre parta del mismo precio, aunque
 * el mock ya haya sido movido por un escenario anterior.
 */
const basePrices = new Map<Address, number>()

export async function basePriceOf(asset: Address): Promise<number> {
  const cached = basePrices.get(asset)
  if (cached !== undefined) return cached
  const p = await readAssetPrice(asset)
  basePrices.set(asset, p)
  return p
}

export function resetBasePrices(): void {
  basePrices.clear()
}
