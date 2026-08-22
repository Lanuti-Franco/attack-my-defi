import { parseUnits, formatUnits, parseAbi } from 'viem'
import { publicClient } from '../chain/client'
import { ASSETS, type AssetSymbol } from '../chain/addresses'

/** QuoterV2 de Uniswap V3: simula un swap sin ejecutarlo. */
const QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as const

/**
 * Pools de WETH/USDC ordenados por profundidad. Se cotiza contra el más líquido
 * y, si el swap es grande, contra los otros: un liquidador reparte la venta
 * entre pools en vez de hundir uno solo.
 */
const POOL_FEES = [500, 3000, 100] as const

const quoterAbi = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])

/** Cuando ningún pool puede absorber la venta, no hay precio: hay un mercado roto. */
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
  /** Unidades vendidas */
  amountSold: number
  /** Precio que se consigue vendiendo esa cantidad, en USD por unidad */
  effectivePrice: number
  /** Precio de referencia al vender una cantidad chica */
  spotPrice: number
  /** Cuánto peor es el precio efectivo, en fracción (0.05 = 5% peor) */
  slippage: number
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
 * inventada: la profundidad del mercado es un dato, no una suposición.
 */
export async function measureMarketImpact(
  asset: AssetSymbol,
  amount: number,
): Promise<MarketImpact> {
  if (asset !== 'WETH') {
    throw new Error('El impacto de mercado sólo está modelado para WETH por ahora')
  }

  const spot = await quoteBest(1)
  const effective = await quoteBest(amount)

  // Un precio de cero no significa "vale cero": significa que ningún pool pudo
  // cotizar la venta. Devolverlo como un slippage del 100% sería inventar un
  // hallazgo donde lo que hay es un mercado sin profundidad.
  if (effective === 0 || spot === 0) throw new NoLiquidityError(amount, asset)

  return {
    amountSold: amount,
    effectivePrice: effective,
    spotPrice: spot,
    slippage: Math.max(0, 1 - effective / spot),
  }
}

/** Mejor precio por unidad al vender `amountWeth`, probando cada pool. */
async function quoteBest(amountWeth: number): Promise<number> {
  const amountIn = parseUnits(amountWeth.toString(), ASSETS.WETH.decimals)
  let best = 0

  for (const fee of POOL_FEES) {
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
      const amountOut = Number(formatUnits(result[0], ASSETS.USDC.decimals))
      const pricePerUnit = amountOut / amountWeth
      if (pricePerUnit > best) best = pricePerUnit
    } catch {
      // Un pool sin profundidad para ese tamaño revierte: se prueba el siguiente.
    }
  }

  return best
}
