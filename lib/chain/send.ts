import type { Abi, Address } from 'viem'
import { publicClient, walletClient, account } from './client'
import { explainRevert } from './aave'

interface SendArgs {
  address: Address
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  value?: bigint
  /** Cuenta a usar; por defecto la cuenta 0 de Anvil */
  from?: Address
}

/**
 * Manda una transacción y falla ruidosamente si no se ejecutó.
 *
 * Existe porque `waitForTransactionReceipt` NO lanza cuando la transacción
 * revierte: devuelve el receipt con status 'reverted' y el código sigue como si
 * hubiera funcionado. Ese silencio es la forma más fácil de que el demo muestre
 * un resultado falso, así que toda escritura pasa por acá.
 */
export async function send({ address, abi, functionName, args, value, from }: SendArgs) {
  const caller = from ?? account.address

  // simulate primero: si va a revertir, viem lanza acá con la razón real.
  try {
    await publicClient.simulateContract({
      account: caller,
      address,
      abi: abi as Abi,
      functionName,
      args: args as never,
      value,
    })
  } catch (err) {
    throw new Error(`${functionName} would revert: ${explainRevert(err)}`)
  }

  const hash = await walletClient.writeContract({
    account: from ?? account,
    address,
    abi: abi as Abi,
    functionName,
    args: args as never,
    value,
    chain: null,
    // Gas fijo y generoso: la estimación de viem se queda corta en el borrow de
    // Aave y la tx muere con OutOfGas DESPUÉS de mover fondos. En un fork el gas
    // no cuesta nada, así que no hay razón para ajustarlo.
    gas: 5_000_000n,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`${functionName} reverted on chain (tx ${hash})`)
  }
  return receipt
}
