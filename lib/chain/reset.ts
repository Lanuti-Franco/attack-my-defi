import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { publicClient, testClient } from './client'
import { safeMessage } from './redact'

/**
 * Dónde queda anotado el snapshot del mundo limpio.
 *
 * Va a un archivo y no a memoria del proceso a propósito: el servidor de Next,
 * los scripts de verificación y cada corrida suelta son procesos distintos que
 * hablan con el mismo Anvil. Compartir la anotación es lo que hace que el
 * mundo se traiga del RPC una sola vez y no una por proceso.
 */
const PRISTINE_FILE = '.anvil-pristine'

function rememberPristine(id: `0x${string}`): void {
  writeFileSync(PRISTINE_FILE, id, 'utf8')
}

function recallPristine(): `0x${string}` | null {
  try {
    const id = readFileSync(PRISTINE_FILE, 'utf8').trim()
    return id.startsWith('0x') ? (id as `0x${string}`) : null
  } catch {
    return null
  }
}

function forgetPristine(): void {
  try {
    rmSync(PRISTINE_FILE)
  } catch {
    // No estaba: no hay nada que olvidar.
  }
}

/**
 * Vuelve a traer el mundo entero desde el RPC remoto.
 *
 * Es lo más caro que hace el sistema y lo más frágil: descarta todo el estado
 * que el fork ya tenía, así que cada slot vuelve a salir por la red. Contra un
 * plan gratuito tarda minutos y a veces directamente falla con un 408 a mitad
 * de camino. Por eso el resto del módulo existe: para llamar a esto lo menos
 * posible.
 */
async function refetchWorld(): Promise<void> {
  const jsonRpcUrl = process.env.ETHEREUM_RPC_URL
  const pinned = process.env.PINNED_BLOCK

  if (!jsonRpcUrl || !pinned) {
    throw new Error(
      'Faltan ETHEREUM_RPC_URL y/o PINNED_BLOCK en .env.local. ' +
        'Son necesarias para resetear el fork a un estado conocido.',
    )
  }

  // El proveedor a veces devuelve un 408 a mitad de la descarga, y perder la
  // corrida entera por eso no tiene sentido cuando reintentar suele alcanzar.
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await testClient.reset({ jsonRpcUrl, blockNumber: BigInt(pinned) })
      return
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(
    `El fork no pudo volver al bloque ${pinned} después de 3 intentos. ` +
      `Último error: ${safeMessage(lastError)}`,
  )
}

/**
 * Deja el fork como si nadie lo hubiera tocado, para que cada corrida arranque
 * del mismo estado del mundo y el mismo ataque siempre dé el mismo número. Sin
 * esto dos tomas del video mostrarían health factors distintos.
 *
 * Revertir a un snapshot logra eso sin salir a la red: lo que el fork ya se
 * trajo se conserva y sólo se descarta lo que escribimos encima. El camino caro
 * queda para cuando no hay snapshot al que volver — la primera corrida, o
 * cualquiera después de que Anvil se reinicie.
 */
export async function resetFork(): Promise<void> {
  const pristine = recallPristine()

  if (pristine) {
    const reverted = (await testClient.request({
      method: 'evm_revert',
      params: [pristine],
    } as never)) as unknown as boolean

    if (reverted === true) {
      // Anvil consume el snapshot al revertir: hay que dejar otro anotado para
      // la corrida siguiente.
      rememberPristine(await testClient.snapshot())
      return
    }

    // El snapshot no existe: Anvil se reinició debajo nuestro y la anotación
    // quedó vieja. Borrarla evita que el próximo proceso confíe en un id que
    // ahora podría apuntar a cualquier otra cosa.
    forgetPristine()
  }

  // Un Anvil recién levantado ya está en el estado que queremos: forkeado al
  // bloque pineado y sin nada encima. Pedirle que se resetee ahí es pagar la
  // descarga entera para llegar a donde ya estamos, y es justo el momento en
  // que el proveedor tiene más chances de cortarnos con un timeout.
  //
  // Que el bloque no haya avanzado alcanza para saberlo: Anvil mina cada
  // transacción, así que cualquier cosa que hayamos escrito lo movió.
  const currentBlock = await publicClient.getBlockNumber()
  if (currentBlock === BigInt(process.env.PINNED_BLOCK ?? -1)) {
    rememberPristine(await testClient.snapshot())
    return
  }

  await refetchWorld()
  rememberPristine(await testClient.snapshot())
}
