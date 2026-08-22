import { parseUnits, maxUint256, type Address } from 'viem'
import { account, testClient } from '../chain/client'
import { ADDRESSES, ASSETS, type AssetSymbol } from '../chain/addresses'
import { poolAbi, erc20Abi, wethAbi } from '../chain/aave'
import { send } from '../chain/send'

export interface Leg {
  asset: AssetSymbol
  amount: number
}

export interface StrategySpec {
  collateral: Leg
  debt: Leg
}

/**
 * Consigue el activo dentro del fork para poder depositarlo.
 *
 * WETH se envuelve con el ETH que Anvil le da a la cuenta. USDC no se puede
 * emitir, así que se toma prestado del aToken de Aave —que guarda ~180M— con
 * impersonación. Es más simple y menos frágil que calcular el slot de storage
 * del balance dentro de un proxy.
 */
async function acquire(asset: AssetSymbol, amount: bigint): Promise<void> {
  if (asset === 'WETH') {
    await send({
      address: ADDRESSES.weth,
      abi: wethAbi,
      functionName: 'deposit',
      value: amount,
    })
    return
  }

  await testClient.impersonateAccount({ address: ADDRESSES.aUsdc })
  await testClient.setBalance({ address: ADDRESSES.aUsdc, value: parseUnits('10', 18) })
  await send({
    from: ADDRESSES.aUsdc,
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [account.address, amount],
  })
  await testClient.stopImpersonatingAccount({ address: ADDRESSES.aUsdc })
}

/**
 * Monta la estrategia como una posición real en el fork: conseguir el colateral,
 * depositarlo en Aave y tomar el préstamo. No es una simulación: son
 * transacciones que Aave procesa y contra las que después se mide.
 */
export async function buildPosition(spec: StrategySpec): Promise<Address> {
  const user = account.address
  const collateral = ASSETS[spec.collateral.asset]
  const debt = ASSETS[spec.debt.asset]

  const collateralAmount = parseUnits(spec.collateral.amount.toString(), collateral.decimals)
  const debtAmount = parseUnits(spec.debt.amount.toString(), debt.decimals)

  await acquire(spec.collateral.asset, collateralAmount)

  await send({
    address: collateral.address,
    abi: erc20Abi,
    functionName: 'approve',
    args: [ADDRESSES.pool, maxUint256],
  })

  await send({
    address: ADDRESSES.pool,
    abi: poolAbi,
    functionName: 'supply',
    args: [collateral.address, collateralAmount, user, 0],
  })

  // interestRateMode 2 = variable
  if (debtAmount > 0n) {
    await send({
      address: ADDRESSES.pool,
      abi: poolAbi,
      functionName: 'borrow',
      args: [debt.address, debtAmount, 2n, 0, user],
    })
  }

  return user
}
