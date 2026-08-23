import { parseUnits, type Address } from 'viem'
import { publicClient, walletClient, testClient, account } from '../chain/client'
import { ADDRESSES, DECIMALS } from '../chain/addresses'
import { oracleAbi } from '../chain/aave'
import { MOCK_AGGREGATOR_BYTECODE } from './mockAggregatorBytecode'

const mockAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'initialPrice', type: 'int256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPrice',
    inputs: [{ name: 'p', type: 'int256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'latestAnswer',
    inputs: [],
    outputs: [{ type: 'int256' }],
    stateMutability: 'view',
  },
] as const

/** Feeds mock ya instalados, por activo. */
const installed = new Map<Address, Address>()

/**
 * Reemplaza la fuente de precio que usa Aave para `asset` por un mock controlable.
 *
 * Usa la propia función de administración de Aave (`setAssetSources`), impersonando
 * al ACLAdmin, que es quien tiene POOL_ADMIN_ROLE. Después de esto el health factor
 * lo sigue calculando Aave: nosotros sólo movemos el precio de entrada.
 */
export async function installMockFeed(asset: Address): Promise<Address> {
  const existing = installed.get(asset)
  if (existing) return existing

  // Precio actual, para que el mock arranque en paridad con la realidad.
  const currentPrice = await publicClient.readContract({
    address: ADDRESSES.oracle,
    abi: oracleAbi,
    functionName: 'getAssetPrice',
    args: [asset],
  })

  const hash = await walletClient.deployContract({
    abi: mockAbi,
    bytecode: MOCK_AGGREGATOR_BYTECODE as `0x${string}`,
    args: [currentPrice],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const mock = receipt.contractAddress
  if (!mock) throw new Error('Deploying the MockAggregator returned no address')

  // El ACLAdmin es un contrato de governance: hay que impersonarlo y darle gas.
  // El stop va en finally para no dejar la cuenta impersonada si algo falla en
  // el medio; una impersonación colgada afecta a todo lo que venga después.
  await testClient.impersonateAccount({ address: ADDRESSES.aclAdmin })
  try {
    await testClient.setBalance({
      address: ADDRESSES.aclAdmin,
      value: parseUnits('10', 18),
    })

    await walletClient.writeContract({
      account: ADDRESSES.aclAdmin,
      address: ADDRESSES.oracle,
      abi: oracleAbi,
      functionName: 'setAssetSources',
      args: [[asset], [mock]],
    })
  } finally {
    await testClient.stopImpersonatingAccount({ address: ADDRESSES.aclAdmin })
  }

  // Verificación: Aave tiene que estar mirando nuestro feed.
  const source = await publicClient.readContract({
    address: ADDRESSES.oracle,
    abi: oracleAbi,
    functionName: 'getSourceOfAsset',
    args: [asset],
  })
  if (source.toLowerCase() !== mock.toLowerCase()) {
    throw new Error(`setAssetSources did not take: Aave is still using ${source}`)
  }

  installed.set(asset, mock)
  return mock
}

/** Fija el precio del activo en USD. Aave lo lee en el próximo getUserAccountData. */
export async function setAssetPrice(asset: Address, priceUsd: number): Promise<void> {
  const mock = installed.get(asset)
  if (!mock) throw new Error(`No mock installed for ${asset}. Call installMockFeed first.`)

  const raw = parseUnits(priceUsd.toFixed(DECIMALS.base), DECIMALS.base)
  const hash = await walletClient.writeContract({
    account,
    address: mock,
    abi: mockAbi,
    functionName: 'setPrice',
    args: [raw],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

/** Olvida los feeds instalados. Necesario tras un evm_revert que los borre. */
export function forgetInstalledFeeds(): void {
  installed.clear()
}
