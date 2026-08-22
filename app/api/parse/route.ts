import { z } from 'zod'
import { parseStrategy } from '@/lib/ai/parser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const requestSchema = z.object({ text: z.string().min(1).max(500) })

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'El body no es JSON válido' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Escribí tu estrategia primero.' }, { status: 400 })
  }

  const result = await parseStrategy(parsed.data.text)
  if (!result.strategy) {
    return Response.json({ error: result.problem }, { status: 422 })
  }
  return Response.json({ strategy: result.strategy })
}
