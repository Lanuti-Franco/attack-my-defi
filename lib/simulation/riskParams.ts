import { parseUnits, type Address } from 'viem'
import { testClient, walletClient, publicClient } from '../chain/client'
import { ADDRESSES } from '../chain/addresses'
import { configuratorAbi, readReserveConfig } from '../chain/aave'

/**
 * Baja el umbral de liquidación de una reserva, como haría un voto de governance.
 *
 * Aave ajusta los parámetros de riesgo de sus activos con cierta frecuencia, y
 * bajarle el liquidation threshold a un colateral vuelve liquidables posiciones
 * que no se movieron ni un centavo. Es el único vector que no depende del
 * mercado: el ataque llega por la gobernanza del protocolo.
 *
 * Se ejecuta contra el PoolConfigurator impersonando al ACLAdmin, que tiene
 * POOL_ADMIN_ROLE — o sea, por el mismo camino que usaría la governance real.
 */
export async function lowerLiquidationThreshold(
  asset: Address,
  dropInPoints: number,
): Promise<{ before: number; after: number }> {
  const config = await readReserveConfig(asset)
  const beforeBps = Math.round(config.liquidationThreshold * 10_000)
  const bonusBps = Math.round((1 + config.liquidationBonus) * 10_000)

  // Aave exige LTV <= liquidationThreshold, así que el LTV baja con él cuando
  // haría falta. Un threshold de cero desactivaría el activo como colateral en
  // vez de volver liquidable la posición, así que se corta antes.
  const afterBps = Math.max(500, beforeBps - Math.round(dropInPoints * 100))
  const ltvBps = Math.min(Math.round(config.ltv * 10_000), afterBps)

  await testClient.impersonateAccount({ address: ADDRESSES.aclAdmin })
  try {
    await testClient.setBalance({ address: ADDRESSES.aclAdmin, value: parseUnits('10', 18) })
    const hash = await walletClient.writeContract({
      account: ADDRESSES.aclAdmin,
      address: ADDRESSES.poolConfigurator,
      abi: configuratorAbi,
      functionName: 'configureReserveAsCollateral',
      args: [asset, BigInt(ltvBps), BigInt(afterBps), BigInt(bonusBps)],
      chain: null,
      gas: 3_000_000n,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw new Error('configureReserveAsCollateral reverted')
    }
  } finally {
    await testClient.stopImpersonatingAccount({ address: ADDRESSES.aclAdmin })
  }

  return { before: beforeBps / 100, after: afterBps / 100 }
}
