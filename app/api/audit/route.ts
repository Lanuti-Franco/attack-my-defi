import { z } from 'zod'
import { strategySchema } from '@/lib/schemas/strategy'
import { runAudit } from '@/lib/ai/audit'
import { safeMessage } from '@/lib/chain/redact'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** La auditoría corre seis vectores seguidos: puede llevar varios minutos. */
export const maxDuration = 900

const requestSchema = z.object({ strategy: strategySchema })

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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      try {
        for await (const event of runAudit({ strategy: parsed.data.strategy })) {
          send(event)
        }
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? safeMessage(err) : 'Unknown error during the audit',
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
