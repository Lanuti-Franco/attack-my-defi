'use client'

import { useMemo, useState } from 'react'
import { StrategyInput } from '@/components/StrategyInput'
import { AttackFeed } from '@/components/AttackFeed'
import { DEFAULT_STRATEGY, type AttackEvent, type Strategy } from '@/lib/schemas/strategy'
import { vectorsFor } from '@/lib/ai/vectors'

export default function Home() {
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY)
  const [vectorId, setVectorId] = useState('price')
  const [events, setEvents] = useState<AttackEvent[]>([])
  const [running, setRunning] = useState(false)

  // Los vectores dependen de la estrategia: no tiene sentido ofrecer un depeg
  // en una posición donde no hay stablecoin.
  const vectors = useMemo(() => vectorsFor(strategy), [strategy])
  const activeVector = vectors.some((v) => v.id === vectorId) ? vectorId : vectors[0].id

  async function attack() {
    setRunning(true)
    setEvents([])

    try {
      const res = await fetch('/api/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, vector: activeVector }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'El ataque no pudo arrancar' }))
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
          setEvents((prev) => [...prev, payload as AttackEvent])
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
          Un atacante busca el escenario más leve que liquida tu posición. Cada health factor
          que ves lo devuelve el contrato de Aave V3 sobre un fork de Ethereum mainnet, y el
          modelo que elige los escenarios corre entero en esta máquina.
        </p>
      </header>

      <StrategyInput
        strategy={strategy}
        onChange={setStrategy}
        vectors={vectors}
        selectedVector={activeVector}
        onSelectVector={setVectorId}
        onAttack={attack}
        running={running}
      />

      <div className="mt-8">
        <AttackFeed events={events} />
      </div>
    </main>
  )
}
