import { parseUnits, formatUnits, parseAbi, type Address } from 'viem'
import { publicClient, testClient, walletClient } from '../chain/client'
import { ADDRESSES, ASSETS, type AssetSymbol } from '../chain/addresses'
import { poolAbi, erc20Abi, wethAbi, readPosition } from '../chain/aave'
import { privateKeyToAccount } from 'viem/accounts'

const poolLiquidityAbi = parseAbi([
  'function getVirtualUnderlyingBalance(address asset) view returns (uint128)',
])

/**
 * Cuenta 1 de Anvil, distinta de la del usuario: la usamos como la ballena que
 * drena el pool. Clave pública y determinística, sólo existe en el fork.
 */
const WHALE = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)

/** Colateral de la ballena, en WETH. Sobra para lo que va a pedir prestado. */
const WHALE_COLLATERAL_WETH = 400_000

/**
 * La ballena deposita WETH, así que sólo puede drenar mercados que no sean WETH:
 * si intentara drenar WETH, su propio colateral aumentaría la liquidez del pool
 * que quiere vaciar y el escenario mediría exactamente lo contrario de lo que
 * dice medir.
 */
function canDrain(asset: AssetSymbol): boolean {
  return asset !== 'WETH'
}

/** true si la ballena ya tiene su colateral depositado en este estado del fork. */
async function whaleIsFunded(): Promise<boolean> {
  const state = await readPosition(WHALE.address)
  return state.collateralUsd > 1
}

/**
 * Deja a la ballena con colateral depositado, lista para pedir prestado.
 *
 * Separado del préstamo a propósito: depositar cientos de miles de WETH es la
 * parte cara y no cambia entre escenarios, mientras que el préstamo es lo que
 * define cada uno.
 *
 * Es idempotente: si ya tiene colateral, no vuelve a depositar. Sin eso, dos
 * llamadas dejarían a la ballena con el doble de colateral y con ello más
 * liquidez de WETH en el pool de la que había.
 */
export async function fundWhale(): Promise<void> {
  if (await whaleIsFunded()) return

  await testClient.setBalance({ address: WHALE.address, value: parseUnits('2000000', 18) })

  const collateral = parseUnits(String(WHALE_COLLATERAL_WETH), ASSETS.WETH.decimals)
  await whaleSend(ADDRESSES.weth, wethAbi, 'deposit', [], collateral)
  await whaleSend(ADDRESSES.weth, erc20Abi, 'approve', [ADDRESSES.pool, collateral])
  await whaleSend(ADDRESSES.pool, poolAbi, 'supply', [
    ADDRESSES.weth,
    collateral,
    WHALE.address,
    0,
  ])
}

export interface DrainResult {
  /** Unidades del activo que la ballena se llevó prestadas */
  drainedUnits: number
  /** Unidades que quedan disponibles en el pool */
  remainingUnits: number
  /** Health factor de la ballena después de pedir prestado */
  whaleHealthFactor: number
}

/**
 * Consume liquidez del pool pidiéndola prestada, como en una corrida real.
 *
 * No alcanza con sacarle los tokens al aToken: Aave V3 lleva contabilidad
 * virtual del underlying, así que transferirlos afuera no cambia lo que el
 * protocolo cree que tiene y las tasas no se mueven. Es una defensa deliberada
 * contra ese tipo de manipulación. La única forma de subir la utilización de
 * verdad es tomar los préstamos.
 *
 * @param percentOfAvailable Porcentaje de la liquidez disponible, de 0 a 100.
 */
export async function drainLiquidity(
  asset: AssetSymbol,
  percentOfAvailable: number,
  opts: { alreadyFunded?: boolean } = {},
): Promise<DrainResult> {
  if (!canDrain(asset)) {
    throw new Error(
      `No se puede drenar el pool de ${asset}: la ballena lo usa como colateral y lo haría ` +
        'más líquido en vez de vaciarlo.',
    )
  }
  if (!(percentOfAvailable >= 0 && percentOfAvailable <= 100)) {
    throw new Error(`percentOfAvailable must be between 0 and 100, got ${percentOfAvailable}`)
  }

  const target = ASSETS[asset]

  if (!opts.alreadyFunded) await fundWhale()

  // La liquidez se mide después de fondear a la ballena: si se midiera antes, el
  // depósito de colateral podría cambiarla y el porcentaje se calcularía sobre
  // un número que ya no existe.
  const available = await publicClient.readContract({
    address: ADDRESSES.pool,
    abi: poolLiquidityAbi,
    functionName: 'getVirtualUnderlyingBalance',
    args: [target.address],
  })

  const toBorrow = (available * BigInt(Math.round(percentOfAvailable * 100))) / 10_000n
  if (toBorrow > 0n) {
    await whaleSend(ADDRESSES.pool, poolAbi, 'borrow', [
      target.address,
      toBorrow,
      2n,
      0,
      WHALE.address,
    ])
  }

  const left = await publicClient.readContract({
    address: ADDRESSES.pool,
    abi: poolLiquidityAbi,
    functionName: 'getVirtualUnderlyingBalance',
    args: [target.address],
  })

  // Una ballena al borde de la liquidación es una segunda posición en riesgo
  // dentro del escenario, y no es lo que se está midiendo. Si queda cerca de 1,
  // el escenario no es válido.
  const whale = await readPosition(WHALE.address)
  if (whale.healthFactor < 1.5) {
    throw new Error(
      `La ballena quedó con health factor ${whale.healthFactor.toFixed(2)} al drenar el ` +
        `${percentOfAvailable}% del pool: sería liquidable ella misma y el escenario dejaría ` +
        'de medir sólo tu posición.',
    )
  }

  return {
    drainedUnits: Number(formatUnits(toBorrow, target.decimals)),
    remainingUnits: Number(formatUnits(left, target.decimals)),
    whaleHealthFactor: whale.healthFactor,
  }
}

async function whaleSend(
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
) {
  const hash = await walletClient.writeContract({
    account: WHALE,
    address,
    abi: abi as never,
    functionName,
    args: args as never,
    value,
    chain: null,
    gas: 5_000_000n,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`The whale could not run ${functionName}: it reverted on chain`)
  }
}
