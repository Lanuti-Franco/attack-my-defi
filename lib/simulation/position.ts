import { parseUnits, maxUint256, type Address } from 'viem'
import { account } from '../chain/client'
import { ADDRESSES, DECIMALS } from '../chain/addresses'
import { poolAbi, erc20Abi, wethAbi } from '../chain/aave'
import { send } from '../chain/send'

export interface StrategySpec {
  /** WETH a depositar como colateral */
  supplyWeth: number
  /** USDC a pedir prestado */
  borrowUsdc: number
}

/**
 * Monta la estrategia como una posición real en el fork:
 * ETH → WETH → supply en Aave → borrow de USDC.
 * No es una simulación: son transacciones que Aave procesa.
 */
export async function buildPosition(spec: StrategySpec): Promise<Address> {
  const user = account.address
  const wethAmount = parseUnits(spec.supplyWeth.toString(), DECIMALS.weth)
  const usdcAmount = parseUnits(spec.borrowUsdc.toString(), DECIMALS.usdc)

  // 1. Envolver ETH (la cuenta de Anvil arranca con 10.000 ETH)
  await send({
    address: ADDRESSES.weth,
    abi: wethAbi,
    functionName: 'deposit',
    value: wethAmount,
  })

  // 2. Aprobar al Pool
  await send({
    address: ADDRESSES.weth,
    abi: erc20Abi,
    functionName: 'approve',
    args: [ADDRESSES.pool, maxUint256],
  })

  // 3. Depositar como colateral
  await send({
    address: ADDRESSES.pool,
    abi: poolAbi,
    functionName: 'supply',
    args: [ADDRESSES.weth, wethAmount, user, 0],
  })

  // 4. Pedir prestado (interestRateMode 2 = variable)
  if (usdcAmount > 0n) {
    await send({
      address: ADDRESSES.pool,
      abi: poolAbi,
      functionName: 'borrow',
      args: [ADDRESSES.usdc, usdcAmount, 2n, 0, user],
    })
  }

  return user
}
