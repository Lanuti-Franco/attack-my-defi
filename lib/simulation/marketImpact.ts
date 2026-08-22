import { parseUnits, formatUnits, parseAbi } from 'viem'
import { publicClient } from '../chain/client'
import { ASSETS, type AssetSymbol } from '../chain/addresses'

/** QuoterV2 de Uniswap V3: simula un swap sin ejecutarlo. */
const QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as const
const FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984' as const

/** Pools de WETH/USDC por comisión. */
const POOL_FEES = [500, 3000, 100] as const

const quoterAbi = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])

const factoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
])

const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
])

/** Cuando ningún pool puede absorber la venta, no hay precio: hay un mercado sin fondo. */
export class NoLiquidityError extends Error {
  constructor(amount: number, asset: string) {
    super(
      `Los pools de Uniswap no tienen profundidad para vender ${amount} ${asset} de una vez. ` +
        'Una liquidación de ese tamaño no encontraría comprador a ningún precio razonable.',
    )
    this.name = 'NoLiquidityError'
  }
}

export interface MarketImpact {
  amountSold: number
  /** Precio promedio que se consigue vendiendo esa cantidad contra un solo pool */
  effectivePrice: number
  /** Precio marginal del pool antes de vender, leído de slot0 */
  spotPrice: number
  /**
   * Cuánto peor es el precio efectivo que el marginal, en fracción.
   *
   * Se reporta con signo: un valor negativo significaría que la venta se ejecutó
   * mejor que el precio marginal, que no puede pasar y delata que los dos
   * números no son comparables. Truncarlo a cero escondería ese síntoma.
   */
  slippage: number
  /** Comisión del pool contra el que se cotizó, en fracción */
  poolFee: number
}

/**
 * Cuánto mueve el precio vender una cantidad de colateral en Uniswap.
 *
 * Es el número que hace posible el vector de cascada: cuando liquidan una
 * posición grande, el liquidador tiene que vender ese colateral en algún lado, y
 * esa venta empuja el precio hacia abajo. Ese empujón es lo que puede liquidar
 * al siguiente.
 *
 * Se cotiza contra los pools reales de Uniswap V3 en el fork, no con una curva
 * inventada. La venta se ejecuta **contra un solo pool**, el que mejor precio dé
 * para ese tamaño. Un router real la repartiría entre varios y conseguiría algo
 * mejor, así que este número es el peor caso de una ejecución sin routing, y por
 * lo tanto una cota superior del impacto.
 */
export async function measureMarketImpact(
  asset: AssetSymbol,
  amount: number,
): Promise<MarketImpact> {
  if (asset !== 'WETH') {
    throw new Error('El impacto de mercado sólo está modelado para WETH por ahora')
  }
  if (!(amount > 0)) {
    throw new Error(`La cantidad a vender tiene que ser positiva, llegó ${amount}`)
  }

  const best = await quoteBest(amount)
  if (!best) throw new NoLiquidityError(amount, asset)

  // El precio de referencia sale del precio marginal del mismo pool contra el
  // que se ejecutó, no de cotizar una venta chica: cotizar aunque sea 1 WETH ya
  // paga comisión y mueve el precio, así que compararse contra eso mezclaría el
  // impacto de la venta con el costo de operar.
  const spotPrice = await marginalPrice(best.fee)

  return {
    amountSold: amount,
    effectivePrice: best.pricePerUnit,
    spotPrice,
    slippage: 1 - best.pricePerUnit / spotPrice,
    poolFee: best.fee / 1_000_000,
  }
}

/** Mejor ejecución para `amountWeth`, contra un único pool. */
async function quoteBest(
  amountWeth: number,
): Promise<{ pricePerUnit: number; fee: number } | null> {
  const amountIn = parseUnits(amountWeth.toString(), ASSETS.WETH.decimals)
  let best: { pricePerUnit: number; fee: number } | null = null

  for (const fee of POOL_FEES) {
    let amountOut: bigint
    try {
      const { result } = await publicClient.simulateContract({
        address: QUOTER,
        abi: quoterAbi,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: ASSETS.WETH.address,
            tokenOut: ASSETS.USDC.address,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })
      amountOut = result[0]
    } catch (err) {
      // Que un pool no pueda cotizar una venta enorme es un resultado válido y
      // se prueba el siguiente. Cualquier otra cosa —RPC caído, ABI equivocada,
      // dirección mal— es un problema nuestro, y disfrazarlo de "no hay
      // liquidez" produciría un hallazgo inventado.
      if (isPoolRevert(err)) continue
      throw err
    }

    const pricePerUnit = Number(formatUnits(amountOut, ASSETS.USDC.decimals)) / amountWeth
    if (!best || pricePerUnit > best.pricePerUnit) best = { pricePerUnit, fee }
  }

  return best
}

/** Precio marginal del pool, derivado de sqrtPriceX96 en slot0. */
async function marginalPrice(fee: number): Promise<number> {
  const pool = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [ASSETS.WETH.address, ASSETS.USDC.address, fee],
  })

  const [slot0, token0] = await Promise.all([
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' }),
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: 'token0' }),
  ])

  const ratio = (Number(slot0[0]) / 2 ** 96) ** 2

  // slot0 expresa el precio de token1 en términos de token0, y cuál es cuál
  // depende del orden de las direcciones, no de cuál nos interesa.
  const usdcIsToken0 = token0.toLowerCase() === ASSETS.USDC.address.toLowerCase()
  const decimalShift = 10 ** (ASSETS.WETH.decimals - ASSETS.USDC.decimals)

  return usdcIsToken0 ? decimalShift / ratio : ratio * decimalShift
}

/** Distingue el revert de un pool sin profundidad de un fallo de infraestructura. */
function isPoolRevert(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('execution reverted') || message.includes('reverted with')
}
