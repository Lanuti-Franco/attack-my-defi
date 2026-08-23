import { z } from 'zod'
import { strategySchema } from '@/lib/schemas/strategy'
import { runAttack } from '@/lib/ai/liquidator'
import { vectorById } from '@/lib/ai/vectors'
import { safeMessage } from '@/lib/chain/redact'

const requestSchema = z.object({
  strategy: strategySchema,
  vector: z
    .enum(['price', 'depeg', 'time', 'governance', 'liquidity', 'cascade'])
    .default('price'),
})

/** El ataque corre simulaciones reales contra el fork: nada de esto se cachea. */
export const dynamic = 'force-dynamic'
/** viem y el SDK de Anthropic necesitan Node, no el runtime edge. */
export const runtime = 'nodejs'
/** Una búsqueda completa puede llevar un par de minutos. */
export const maxDuration = 300

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'The request body is not valid JSON' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    )
  }

  const { strategy, vector: vectorId } = parsed.data
  const vector = vectorById(strategy, vectorId)
  if (!vector) {
    return Response.json(
      { error: `Attack "${vectorId}" does not apply to this position` },
      { status: 400 },
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const event of runAttack({ strategy, vector })) {
          send(event)
        }
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? safeMessage(err) : 'Unknown error during the attack',
        })
      } finally {
        send({ type: 'done' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
