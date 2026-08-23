import { parseUnits, maxUint256, type Address } from 'viem'
import { account, testClient } from '../chain/client'
import { ADDRESSES, ASSETS, type AssetSymbol } from '../chain/addresses'
import { poolAbi, erc20Abi, wethAbi, readPosition, readAssetPrice } from '../chain/aave'
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
 * WETH se envuelve con el ETH que Anvil le da a la cuenta. Los demás no se
 * pueden emitir, así que se le sacan a su propio aToken de Aave —que guarda de
 * sobra— con impersonación. Es más simple y menos frágil que calcular el slot
 * de storage del balance dentro de un proxy.
 */
async function acquire(asset: AssetSymbol, amount: bigint): Promise<void> {
  const { address, funder } = ASSETS[asset]

  if (!funder) {
    await send({ address, abi: wethAbi, functionName: 'deposit', value: amount })
    return
  }

  await testClient.impersonateAccount({ address: funder })
  // El aToken no tiene ETH propio: sin esto no puede pagar el gas del transfer.
  await testClient.setBalance({ address: funder, value: parseUnits('10', 18) })
  await send({
    from: funder,
    address,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [account.address, amount],
  })
  await testClient.stopImpersonatingAccount({ address: funder })
}

/**
 * Un préstamo que Aave no va a permitir, explicado antes de intentarlo.
 *
 * Sin esto el intento revierte y llega a la pantalla como "custom error
 * 0x6679996d", que no le dice nada a nadie. Lo que hace falta saber es cuánto
 * sí entra, y ese número lo tiene Aave: `availableBorrowsBase` es exactamente
 * cuánto más presta contra el colateral ya depositado.
 */
export class BorrowTooLargeError extends Error {
  constructor(asked: number, allowed: number, asset: string) {
    const fits = allowed.toLocaleString('en-US', { maximumFractionDigits: 2 })
    super(
      `That loan does not fit: Aave lends at most ${fits} ${asset} against this collateral, ` +
        `and you asked for ${asked.toLocaleString('en-US')}. Deposit more collateral, or borrow less.`,
    )
    this.name = 'BorrowTooLargeError'
  }
}

/** Compara lo pedido contra lo que Aave dice que presta, antes de pedirlo. */
async function assertBorrowFits(user: Address, spec: StrategySpec): Promise<void> {
  const [state, unitPrice] = await Promise.all([
    readPosition(user),
    readAssetPrice(ASSETS[spec.debt.asset].address),
  ])

  const allowedUnits = unitPrice > 0 ? state.availableBorrowsUsd / unitPrice : 0
  if (spec.debt.amount > allowedUnits) {
    throw new BorrowTooLargeError(spec.debt.amount, allowedUnits, spec.debt.asset)
  }
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
    await assertBorrowFits(user, spec)
    await send({
      address: ADDRESSES.pool,
      abi: poolAbi,
      functionName: 'borrow',
      args: [debt.address, debtAmount, 2n, 0, user],
    })
  }

  return user
}
