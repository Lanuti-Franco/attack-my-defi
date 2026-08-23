import { parseAbi, formatUnits, type Address } from 'viem'
import { publicClient } from './client'
import { ADDRESSES, DECIMALS } from './addresses'

export const poolAbi = parseAbi([
  'function getConfiguration(address asset) view returns (uint256)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
])

export const oracleAbi = parseAbi([
  'function getAssetPrice(address asset) view returns (uint256)',
  'function getSourceOfAsset(address asset) view returns (address)',
  'function setAssetSources(address[] assets, address[] sources)',
  'function BASE_CURRENCY_UNIT() view returns (uint256)',
])

export const configuratorAbi = parseAbi([
  'function configureReserveAsCollateral(address asset, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus)',
])

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
])

export const wethAbi = parseAbi(['function deposit() payable'])

/**
 * Estado de una posición tal como lo reporta Aave, ya convertido a números
 * legibles. `getUserAccountData` devuelve más campos de los que hay acá; los
 * que no se usan no se traen, para que nadie tenga que preguntarse cuál es el
 * bueno cuando dos parezcan decir lo mismo.
 */
export interface PositionState {
  collateralUsd: number
  debtUsd: number
  /** Liquidation threshold en fracción (0.83), convertido desde bps */
  liquidationThreshold: number
  /** Infinity cuando no hay deuda (Aave devuelve max uint256) */
  healthFactor: number
}

const MAX_UINT256 = (1n << 256n) - 1n

/** Lee el estado de la posición directamente de Aave. Ningún número se calcula acá. */
export async function readPosition(user: Address): Promise<PositionState> {
  const r = await publicClient.readContract({
    address: ADDRESSES.pool,
    abi: poolAbi,
    functionName: 'getUserAccountData',
    args: [user],
  })

  const [totalCollateralBase, totalDebtBase, , currentLiquidationThreshold, , healthFactor] = r

  return {
    collateralUsd: Number(formatUnits(totalCollateralBase, DECIMALS.base)),
    debtUsd: Number(formatUnits(totalDebtBase, DECIMALS.base)),
    liquidationThreshold: Number(currentLiquidationThreshold) / 10_000,
    healthFactor:
      healthFactor === MAX_UINT256
        ? Infinity
        : Number(formatUnits(healthFactor, DECIMALS.healthFactor)),
  }
}

/** Precio de un activo según el oráculo de Aave, en USD (8 decimales). */
export async function readAssetPrice(asset: Address): Promise<number> {
  const p = await publicClient.readContract({
    address: ADDRESSES.oracle,
    abi: oracleAbi,
    functionName: 'getAssetPrice',
    args: [asset],
  })
  return Number(formatUnits(p, DECIMALS.base))
}

/** Custom errors de Aave, para no mostrar un hex crudo cuando algo revierte. */
export const AAVE_ERRORS: Record<string, string> = {
  '0x911ceb81': 'CollateralCannotCoverNewBorrow: el colateral no alcanza para ese préstamo',
  '0x4b6b0ea3': 'HealthFactorLowerThanLiquidationThreshold',
}

export function explainRevert(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [sig, human] of Object.entries(AAVE_ERRORS)) {
    if (msg.includes(sig)) return human
  }
  return msg
}

/**
 * Parámetros de riesgo de una reserva, desempaquetados del bitmap que devuelve
 * `getConfiguration`. Aave los guarda así para ahorrar storage: cada campo ocupa
 * un rango de bits fijo dentro de un único uint256.
 */
export interface ReserveConfig {
  /** Loan-to-value máximo, en fracción (0.805) */
  ltv: number
  /** Umbral de liquidación, en fracción (0.83) */
  liquidationThreshold: number
  /** Bonus que se lleva el liquidador, en fracción sobre 1 (0.05 = 5%) */
  liquidationBonus: number
  decimals: number
}

export async function readReserveConfig(asset: Address): Promise<ReserveConfig> {
  const raw = await publicClient.readContract({
    address: ADDRESSES.pool,
    abi: poolAbi,
    functionName: 'getConfiguration',
    args: [asset],
  })

  const bits = (offset: bigint, width: bigint) =>
    Number((raw >> offset) & ((1n << width) - 1n))

  return {
    ltv: bits(0n, 16n) / 10_000,
    liquidationThreshold: bits(16n, 16n) / 10_000,
    // Aave lo guarda como 10500 = 105%, es decir 5% de bonus sobre el valor.
    liquidationBonus: bits(32n, 16n) / 10_000 - 1,
    decimals: bits(48n, 8n),
  }
}
