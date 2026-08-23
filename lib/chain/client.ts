import { createPublicClient, createWalletClient, createTestClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { ANVIL_ACCOUNT } from './addresses'

/** Anvil persistente, forkeado de mainnet con bloque pineado. */
export const FORK_URL = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8545'

/**
 * El timeout por defecto de viem (10s) alcanza para llamadas normales pero no
 * para `anvil_reset`, que vuelve a traer el estado del fork desde el RPC remoto
 * y puede tardar bastante más cuando el fork acumuló estado.
 */
const transport = http(FORK_URL, { timeout: 180_000 })

export const publicClient = createPublicClient({ chain: mainnet, transport })

export const account = privateKeyToAccount(ANVIL_ACCOUNT.privateKey)

export const walletClient = createWalletClient({ account, chain: mainnet, transport })

/** Cliente para los métodos anvil_* / evm_* (snapshot, impersonate, setBalance). */
export const testClient = createTestClient({ chain: mainnet, mode: 'anvil', transport })

/** Falla temprano y con un mensaje claro si Anvil no está levantado. */
export async function assertForkAlive(): Promise<number> {
  try {
    const bn = await publicClient.getBlockNumber()
    return Number(bn)
  } catch {
    throw new Error(
      `No Anvil listening on ${FORK_URL}. Start one with:\n` +
        `  anvil --fork-url $ETHEREUM_RPC_URL --fork-block-number <BLOCK> --port 8545`,
    )
  }
}
