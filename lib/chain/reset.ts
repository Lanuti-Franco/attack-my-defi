import { testClient } from './client'

/**
 * Devuelve el fork al bloque pineado, descartando todo lo que se haya hecho.
 *
 * Es lo que hace que el sistema sea reproducible: cada corrida arranca del mismo
 * estado del mundo, así que el mismo ataque siempre da el mismo número. Sin esto
 * dos tomas del video mostrarían health factors distintos.
 */
export async function resetFork(): Promise<void> {
  const jsonRpcUrl = process.env.ETHEREUM_RPC_URL
  const pinned = process.env.PINNED_BLOCK

  if (!jsonRpcUrl || !pinned) {
    throw new Error(
      'Faltan ETHEREUM_RPC_URL y/o PINNED_BLOCK en .env.local. ' +
        'Son necesarias para resetear el fork a un estado conocido.',
    )
  }

  await testClient.reset({
    jsonRpcUrl,
    blockNumber: BigInt(pinned),
  })
}
