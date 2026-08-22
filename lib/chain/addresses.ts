import type { Address } from 'viem'

/** Direcciones de Ethereum mainnet. Verificadas contra la cadena el 22/08/2026. */
export const ADDRESSES = {
  // Aave V3
  poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
  pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
  aclManager: '0xc2aaCf6553D20d1e9d78E365AAba8032af9c85b0',
  /** Governance executor: tiene POOL_ADMIN_ROLE, es a quien impersonamos. */
  aclAdmin: '0x5300A1a15135EA4dc7aD5a167152C01EFc9b192A',

  // Activos
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',

  /**
   * aToken de USDC. Guarda el USDC depositado en Aave (~180M), así que en el
   * fork lo impersonamos para fondear la cuenta de prueba: es más simple y menos
   * frágil que calcular el slot de storage del balance de un proxy.
   */
  aUsdc: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
} as const satisfies Record<string, Address>

/** Cuenta 0 de Anvil. Clave pública y determinística: sólo existe en el fork. */
export const ANVIL_ACCOUNT = {
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
} as const

/**
 * Escalas que devuelve Aave. Mezclarlas es el bug más probable del proyecto:
 * getUserAccountData usa las tres a la vez.
 */
export const DECIMALS = {
  /** totalCollateralBase, totalDebtBase, availableBorrowsBase y precios del oráculo */
  base: 8,
  /** healthFactor */
  healthFactor: 18,
  /** ltv y currentLiquidationThreshold vienen en basis points (8300 = 83%) */
  bps: 4,
  weth: 18,
  usdc: 6,
} as const

export type AssetSymbol = 'WETH' | 'USDC'

/** Metadatos por activo, para no repetir decimales ni direcciones. */
export const ASSETS = {
  WETH: { address: ADDRESSES.weth, decimals: DECIMALS.weth, label: 'WETH' },
  USDC: { address: ADDRESSES.usdc, decimals: DECIMALS.usdc, label: 'USDC' },
} as const satisfies Record<AssetSymbol, { address: Address; decimals: number; label: string }>
