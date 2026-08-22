import Anthropic from '@anthropic-ai/sdk'
import { ScenarioEngine } from '../simulation/scenarioEngine'
import { shockInputSchema, type Strategy, type AttackEvent } from '../schemas/strategy'

const MODEL = 'claude-opus-5'
const MAX_ATTEMPTS = 12

const SYSTEM = `Sos un atacante de posiciones DeFi. Tu objetivo es encontrar la caída de
precio más chica de ETH que deja liquidable una posición en Aave V3.

Tenés una sola herramienta: simulate_price_shock. Cada llamada corre una simulación real
sobre un fork de Ethereum mainnet y devuelve el health factor que reporta el contrato de
Aave. Una posición es liquidable cuando el health factor cae por debajo de 1.

Reglas que no podés romper:
- NUNCA estimes, calcules ni inventes un health factor. El único health factor válido es
  el que devuelve la herramienta. Si no llamaste a la herramienta, no sabés el número.
- NUNCA afirmes que una posición sobrevive o muere sin haberlo simulado.
- Buscá de forma eficiente: empezá con un shock grueso para acotar el rango y después
  refiná. No hace falta que llegues a más de un decimal de precisión.
- Cuando tengas el shock mínimo con precisión de ~0,1 puntos porcentuales, pará y dalo
  como resultado.

Antes de cada llamada, decí en una frase corta qué estás probando y por qué. Al terminar,
resumí en dos o tres frases qué tan frágil es la posición, citando sólo números que hayas
obtenido de la herramienta.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'simulate_price_shock',
    description:
      'Aplica una caída porcentual al precio de ETH sobre un fork real de Ethereum mainnet ' +
      'y devuelve el health factor que reporta el contrato de Aave V3, junto con el veredicto ' +
      'SURVIVED o LIQUIDATABLE. Es la única fuente válida de health factors.',
    input_schema: {
      type: 'object',
      properties: {
        shock_pct: {
          type: 'number',
          description: 'Cambio porcentual del precio de ETH. Negativo: -25 significa que ETH cae 25%.',
        },
        reasoning: {
          type: 'string',
          description: 'Una frase corta explicando por qué probás este valor.',
        },
      },
      required: ['shock_pct'],
    },
  },
]

export interface AttackOptions {
  strategy: Strategy
  apiKey?: string
}

/**
 * Corre el ataque y va emitiendo lo que pasa.
 *
 * El modelo decide qué escenarios probar; los health factors salen siempre del
 * simulador, que a su vez los lee del contrato de Aave. El modelo nunca produce
 * un número: si intenta afirmar uno sin simular, no hay forma de que coincida
 * con lo que reporta el feed, porque el feed sólo muestra resultados de tool calls.
 */
export async function* runAttack(opts: AttackOptions): AsyncGenerator<AttackEvent> {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {})
  const engine = new ScenarioEngine()

  const base = await engine.setup(opts.strategy)
  yield {
    type: 'position',
    collateralUsd: base.collateralUsd,
    debtUsd: base.debtUsd,
    healthFactor: base.healthFactor,
    liquidationThreshold: base.liquidationThreshold,
  }

  if (base.debtUsd < 1) {
    yield {
      type: 'error',
      message: 'La posición no tiene deuda, así que no puede liquidarse. Pedí prestado algo.',
    }
    return
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Posición a atacar, ya montada en el fork:\n` +
        `- colateral: ${base.collateralUsd.toFixed(2)} USD en WETH\n` +
        `- deuda: ${base.debtUsd.toFixed(2)} USD en USDC\n` +
        `- liquidation threshold: ${(base.liquidationThreshold * 100).toFixed(2)}%\n` +
        `- health factor actual: ${base.healthFactor.toFixed(4)}\n\n` +
        `Encontrá la caída mínima de ETH que la deja liquidable.`,
    },
  ]

  /** Shocks que la herramienta confirmó como liquidables. */
  let smallestKillingShock: number | null = null
  let attempts = 0

  while (attempts < MAX_ATTEMPTS) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    })

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        yield { type: 'thinking', text: block.text.trim() }
      }
    }

    if (response.stop_reason !== 'tool_use') {
      const finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      yield { type: 'conclusion', minimalShockPct: smallestKillingShock, text: finalText }
      return
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      const parsed = shockInputSchema.safeParse(block.input)
      if (!parsed.success) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: `Input inválido: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        })
        continue
      }

      attempts++
      const shock = parsed.data.shock_pct

      try {
        const result = await engine.runPriceShock(shock)
        const hf = result.state.healthFactor

        if (result.verdict === 'LIQUIDATABLE') {
          if (smallestKillingShock === null || shock > smallestKillingShock) {
            smallestKillingShock = shock
          }
        }

        yield {
          type: 'attempt',
          shockPct: shock,
          healthFactor: hf,
          verdict: result.verdict,
          collateralUsd: result.state.collateralUsd,
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({
            shock_pct: shock,
            collateral_usd: Number(result.state.collateralUsd.toFixed(2)),
            debt_usd: Number(result.state.debtUsd.toFixed(2)),
            health_factor: Number(hf.toFixed(6)),
            verdict: result.verdict,
          }),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        yield { type: 'error', message }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: `La simulación falló: ${message}`,
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }

  yield {
    type: 'conclusion',
    minimalShockPct: smallestKillingShock,
    text: `Corté la búsqueda tras ${MAX_ATTEMPTS} simulaciones.`,
  }
}
