import { completion } from '@qvac/sdk'
import { z } from 'zod'
import { strategySchema, type Strategy } from '../schemas/strategy'
import { ensureModel, GENERATION_PARAMS } from './localModel'

/**
 * Convierte una descripción en castellano en una estrategia estructurada.
 *
 * El modelo no calcula nada acá: sólo identifica qué activo va en cada pata y con
 * qué monto. Lo que devuelve pasa por el mismo schema que valida el formulario,
 * así una alucinación no puede entrar al simulador con una forma inválida.
 */
export interface ParseResult {
  strategy: Strategy | null
  /** Por qué no se pudo interpretar, cuando strategy es null. */
  problem?: string
}

const SYSTEM = `You extract DeFi lending positions from a sentence written in Spanish.

The user describes what they deposit as collateral and what they borrow against it.
Call describe_position exactly once with the four values.

Only WETH and USDC are supported. "ETH" and "eth" mean WETH. "dolares", "usd" and
"stablecoin" mean USDC. Amounts written as "150k" mean 150000, "1.5M" means 1500000.

Extract only what is written. Never invent an amount that is not in the sentence.`

export async function parseStrategy(text: string, modelId?: string): Promise<ParseResult> {
  const trimmed = text.trim()
  if (!trimmed) return { strategy: null, problem: 'Escribí tu estrategia primero.' }

  const id = modelId ?? (await ensureModel())

  const run = completion({
    modelId: id,
    stream: false,
    generationParams: GENERATION_PARAMS,
    history: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: trimmed },
    ],
    tools: [
      {
        name: 'describe_position',
        description: 'Records the lending position described by the user.',
        parameters: z.object({
          collateral_asset: z.string().describe('Asset deposited as collateral: WETH or USDC'),
          collateral_amount: z.number().describe('How much of that asset is deposited'),
          debt_asset: z.string().describe('Asset borrowed: WETH or USDC'),
          debt_amount: z.number().describe('How much of that asset is borrowed'),
        }),
      },
    ],
  })

  const final = await run.final
  const call = (await final.toolCalls).find((c) => c.name === 'describe_position')
  if (!call) {
    return {
      strategy: null,
      problem: 'No pude identificar una posición ahí. Probá algo como "deposito 100 ETH y pido 150k USDC".',
    }
  }

  const args = call.arguments as Record<string, unknown>
  const normalizeAsset = (v: unknown): string => {
    const s = String(v ?? '').toUpperCase().trim()
    if (s === 'ETH' || s === 'WETH') return 'WETH'
    if (s === 'USDC' || s === 'USD' || s === 'DAI' || s === 'USDT') return 'USDC'
    return s
  }

  const candidate = {
    collateral: {
      asset: normalizeAsset(args.collateral_asset),
      amount: Number(args.collateral_amount),
    },
    debt: {
      asset: normalizeAsset(args.debt_asset),
      amount: Number(args.debt_amount),
    },
  }

  // La salida del modelo pasa por el mismo schema que el formulario: si inventó
  // un activo o un monto imposible, se rechaza acá y no llega al simulador.
  const parsed = strategySchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      strategy: null,
      problem: parsed.error.issues.map((i) => i.message).join('; '),
    }
  }

  return { strategy: parsed.data }
}
