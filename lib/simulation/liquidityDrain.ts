import { parseUnits, formatUnits, parseAbi, type Address } from 'viem'
import { publicClient, testClient, walletClient } from '../chain/client'
import { ADDRESSES, ASSETS, type AssetSymbol } from '../chain/addresses'
import { poolAbi, erc20Abi, wethAbi } from '../chain/aave'
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

/**
 * Consume liquidez del pool pidiéndola prestada, como en una corrida real.
 *
 * No alcanza con sacarle los tokens al aToken: Aave V3 lleva contabilidad
 * virtual del underlying, así que transferirlos afuera no cambia lo que el
 * protocolo cree que tiene y las tasas no se mueven. Es una defensa deliberada
 * contra ese tipo de manipulación. La única forma de subir la utilización de
 * verdad es tomar los préstamos.
 *
 * La ballena se fondea con `anvil_setBalance`, deposita WETH y pide prestado el
 * porcentaje pedido de la liquidez disponible.
 */
export async function drainLiquidity(
  asset: AssetSymbol,
  pctOfAvailable: number,
): Promise<{ drainedUsd: number; remainingUsd: number }> {
  const target = ASSETS[asset]

  const available = await publicClient.readContract({
    address: ADDRESSES.pool,
    abi: poolLiquidityAbi,
    functionName: 'getVirtualUnderlyingBalance',
    args: [target.address],
  })

  const toBorrow = (available * BigInt(Math.round(pctOfAvailable * 100))) / 10_000n
  if (toBorrow === 0n) {
    return {
      drainedUsd: 0,
      remainingUsd: Number(formatUnits(available, target.decimals)),
    }
  }

  // Colateral de sobra para lo que va a pedir: el precio no importa mientras
  // alcance, y sobre-colateralizar evita que la ballena sea liquidable y
  // ensucie el escenario.
  await testClient.setBalance({ address: WHALE.address, value: parseUnits('2000000', 18) })

  const collateralWeth = parseUnits('400000', 18)
  await whaleSend(ADDRESSES.weth, wethAbi, 'deposit', [], collateralWeth)
  await whaleSend(ADDRESSES.weth, erc20Abi, 'approve', [ADDRESSES.pool, collateralWeth])
  await whaleSend(ADDRESSES.pool, poolAbi, 'supply', [
    ADDRESSES.weth,
    collateralWeth,
    WHALE.address,
    0,
  ])
  await whaleSend(ADDRESSES.pool, poolAbi, 'borrow', [
    target.address,
    toBorrow,
    2n,
    0,
    WHALE.address,
  ])

  const left = await publicClient.readContract({
    address: ADDRESSES.pool,
    abi: poolLiquidityAbi,
    functionName: 'getVirtualUnderlyingBalance',
    args: [target.address],
  })

  return {
    drainedUsd: Number(formatUnits(toBorrow, target.decimals)),
    remainingUsd: Number(formatUnits(left, target.decimals)),
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
    throw new Error(`La ballena no pudo ejecutar ${functionName}: revirtió en la cadena`)
  }
}
