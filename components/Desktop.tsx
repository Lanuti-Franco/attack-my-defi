'use client'

import { useEffect, useState } from 'react'
import { PositionPanel } from '@/components/PositionPanel'
import { AuditReport } from '@/components/AuditReport'
import { Faq } from '@/components/Faq'
import { Window } from '@/components/win95/Window'
import { HealthBar } from '@/components/win95/HealthBar'
import { Taskbar } from '@/components/win95/Taskbar'
import { play, loadMutePreference, setMuted } from '@/lib/sound'
import { MODEL_LABEL } from '@/lib/ai/modelName'
import { DEFAULT_STRATEGY, type AuditEvent, type Strategy } from '@/lib/schemas/strategy'

const usd = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

/** Qué se escucha cuando llega cada cosa. */
function announce(event: AuditEvent): void {
  if (event.type === 'vectorStart') return play('open')
  if (event.type === 'attempt' && event.verdict === 'LIQUIDATABLE') return play('hit')
  if (event.type === 'vectorDone') return play(event.thresholdLabel ? 'defeat' : 'survive')
  if (event.type === 'recommendations') return play('done')
}

export function Desktop({ forkBlock }: { forkBlock: string }) {
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [running, setRunning] = useState(false)
  const [muted, setMutedState] = useState(false)

  // La preferencia vive en el navegador, así que se lee después del montaje:
  // leerla durante el render haría que servidor y cliente dibujen distinto.
  useEffect(() => setMutedState(loadMutePreference()), [])

  function toggleMute() {
    const next = !muted
    setMutedState(next)
    setMuted(next)
    if (!next) play('click')
  }

  async function audit() {
    play('click')
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
          announce(payload as AuditEvent)
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

  const position = events.findLast((e) => e.type === 'position')
  const openTasks = [
    'Attack My DeFi',
    ...events.filter((e) => e.type === 'vectorStart').map((e) => e.label),
  ]

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-3 pt-5 pb-20 sm:px-6">
      <Window title="Attack My DeFi" icon="🏰">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="font-mono mb-2 text-[12px] leading-relaxed">
              Seis ataques distintos contra tu posición en Aave, y qué tendrías que hacer para
              sobrevivirlos. El modelo elige qué escenario probar; los números los devuelve el
              contrato de Aave sobre un fork de Ethereum mainnet.
            </p>

            {/* Que la inferencia sea local es el punto entero del proyecto, así
                que va donde se lee sin abrir nada. */}
            <p className="sunken font-mono bg-(--field) px-2 py-[6px] text-[11px]">
              <span className="text-(--ink-soft)">modelo</span> {MODEL_LABEL} ·{' '}
              <span className="text-(--ink-soft)">corre en</span> esta máquina, vía QVAC ·{' '}
              <span className="text-(--ink-soft)">llamadas a APIs externas</span> ninguna
            </p>

            {position && (
              <div className="mt-3">
                <HealthBar
                  healthFactor={position.healthFactor}
                  label="Resistencia de la posición"
                />
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                  <Stat label="Colateral" value={usd(position.collateralUsd)} />
                  <Stat label="Deuda" value={usd(position.debtUsd)} />
                  <Stat
                    label="Umbral de liquidación"
                    value={`${(position.liquidationThreshold * 100).toFixed(0)}%`}
                  />
                </dl>
              </div>
            )}
          </div>

          <PositionPanel
            strategy={strategy}
            onChange={setStrategy}
            onAudit={audit}
            running={running}
          />
        </div>
      </Window>

      <div className="mt-4">
        <AuditReport events={events} forkBlock={forkBlock} />
      </div>

      <div className="mt-4">
        <Faq />
      </div>

      <Taskbar
        forkBlock={forkBlock}
        tasks={openTasks}
        running={running}
        muted={muted}
        onToggleMute={toggleMute}
      />
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-chrome text-[9px] text-(--ink-soft)">{label}</dt>
      <dd className="font-mono text-[14px] font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
