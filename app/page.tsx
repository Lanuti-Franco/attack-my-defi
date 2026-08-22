'use client'

import { useState } from 'react'
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput'
import { StrategyInput } from '@/components/StrategyInput'
import { AuditReport } from '@/components/AuditReport'
import { DEFAULT_STRATEGY, type AuditEvent, type Strategy } from '@/lib/schemas/strategy'

export default function Home() {
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [running, setRunning] = useState(false)

  async function audit() {
    setRunning(true)
    setEvents([])

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'La auditoría no pudo arrancar' }))
        setEvents([{ type: 'error', message: err.error }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const line = chunk.trim()
          if (!line.startsWith('data: ')) continue
          const payload = JSON.parse(line.slice(6))
          if (payload.type === 'done') continue
          setEvents((prev) => [...prev, payload as AuditEvent])
        }
      }
    } catch (err) {
      setEvents((prev) => [
        ...prev,
        { type: 'error', message: err instanceof Error ? err.message : 'Error de red' },
      ])
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-100">Attack My DeFi</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Seis ataques distintos contra tu posición en Aave, y qué tendrías que hacer para
          sobrevivirlos. Cada health factor lo devuelve el contrato de Aave sobre un fork de
          Ethereum mainnet, y el modelo que elige los escenarios corre entero en esta máquina.
        </p>
      </header>

      <NaturalLanguageInput onParsed={setStrategy} disabled={running} />

      <div className="mt-4">
        <StrategyInput
          strategy={strategy}
          onChange={setStrategy}
          onAudit={audit}
          running={running}
        />
      </div>

      <div className="mt-8">
        <AuditReport events={events} />
      </div>
    </main>
  )
}
