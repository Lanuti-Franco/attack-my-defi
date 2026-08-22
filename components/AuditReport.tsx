'use client'

import { useEffect, useRef, useState } from 'react'
import type { AuditEvent, RecommendationView } from '@/lib/schemas/strategy'
import { Window, ProgressBar } from '@/components/win95/Window'
import { Verdict, breachesFrom } from '@/components/Verdict'
import { AgentLoop } from '@/components/AgentLoop'
import { AttackQueue, type QueueItem } from '@/components/AttackQueue'

const usd = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const hf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))

/**
 * Cada ataque tiene su ícono de asedio: la catapulta pega de frente, el ariete
 * es la masa que arrastra, el reloj es el asedio que gana esperando.
 */
const UNIT: Record<string, string> = {
  price: '🪨',
  depeg: '🧪',
  time: '⏳',
  governance: '📜',
  liquidity: '🕳️',
  cascade: '🐏',
}

interface VectorRun {
  id: string
  label: string
  premise: string
  attempts: Extract<AuditEvent, { type: 'attempt' }>[]
  thresholdLabel: string | null
  attackerProfitUsd?: number
  survivedMessage: string
  done: boolean
  started: boolean
}

/** Reconstruye el informe a partir del stream de eventos. */
function build(events: AuditEvent[]) {
  const vectors = new Map<string, VectorRun>()
  let position: Extract<AuditEvent, { type: 'position' }> | null = null
  let recommendations: RecommendationView[] = []
  const errors: string[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'position':
        position = ev
        break
      case 'auditStart':
        // Los seis existen desde acá, aunque todavía no haya corrido ninguno.
        for (const { id, label } of ev.vectors) {
          vectors.set(id, {
            id,
            label,
            premise: '',
            attempts: [],
            thresholdLabel: null,
            survivedMessage: '',
            done: false,
            started: false,
          })
        }
        break
      case 'vectorStart': {
        const v = vectors.get(ev.vectorId)
        if (v) {
          v.premise = ev.premise
          v.started = true
        }
        break
      }
      case 'attempt':
        vectors.get(ev.vectorId)?.attempts.push(ev)
        break
      case 'vectorDone': {
        const v = vectors.get(ev.vectorId)
        if (v) {
          v.thresholdLabel = ev.thresholdLabel
          v.attackerProfitUsd = ev.attackerProfitUsd
          v.survivedMessage = ev.survivedMessage
          v.done = true
        }
        break
      }
      case 'recommendations':
        recommendations = ev.recommendations
        break
      case 'error':
        errors.push(ev.message)
        break
    }
  }

  return { position, vectors: [...vectors.values()], recommendations, errors }
}

function stateOf(run: VectorRun): QueueItem['state'] {
  if (!run.started) return 'pending'
  if (!run.done) return 'running'
  return run.thresholdLabel ? 'breached' : 'survived'
}

export function AuditReport({
  events,
  forkBlock,
}: {
  events: AuditEvent[]
  forkBlock: string
}) {
  const { position, vectors, recommendations, errors } = build(events)

  const running = vectors.find((v) => v.started && !v.done)
  const finished = recommendations.length > 0

  // El foco sigue al ataque en curso solo hasta que alguien elige otro: pisarle
  // la elección al que está leyendo un log es peor que no seguir nada.
  const [chosen, setChosen] = useState<string | null>(null)
  const chosenRef = useRef<string | null>(null)
  useEffect(() => {
    chosenRef.current = chosen
  }, [chosen])

  const focusedId = chosen ?? running?.id ?? vectors.find((v) => v.done)?.id ?? null
  const focused = vectors.find((v) => v.id === focusedId) ?? null

  if (!position && !errors.length) return null

  return (
    <div className="flex flex-col gap-4">
      {errors.map((message, i) => (
        <Window key={i} title="Error" icon="⛔">
          <p className="font-mono text-[12px] leading-relaxed">{message}</p>
        </Window>
      ))}

      {finished && (
        <Verdict
          breaches={breachesFrom(events)}
          vectorsRun={vectors.length}
          recommendation={recommendations.find((r) => !r.alreadySafe) ?? recommendations[0] ?? null}
          forkBlock={forkBlock}
        />
      )}

      {vectors.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {focused ? <Console run={focused} /> : <Waiting />}

          <Window title="Los ataques" icon="⚔️">
            <AttackQueue
              items={vectors.map((v) => ({
                id: v.id,
                label: v.label,
                state: stateOf(v),
                thresholdLabel: v.thresholdLabel,
                probes: v.attempts.length,
              }))}
              focused={focusedId}
              onFocus={setChosen}
            />
          </Window>
        </div>
      )}
    </div>
  )
}

/** El ataque en foco, con el bucle completo. */
function Console({ run }: { run: VectorRun }) {
  const dead = run.done && run.thresholdLabel !== null

  return (
    <Window
      title={run.label}
      icon={UNIT[run.id] ?? '⚔️'}
      tone={dead ? 'dead' : 'normal'}
      className="min-h-[22rem]"
    >
      {dead ? (
        <BlueScreen run={run} />
      ) : (
        <>
          {run.premise && (
            <p className="font-mono mb-3 text-[12px] leading-relaxed text-(--ink-soft)">
              {run.premise}
            </p>
          )}

          {!run.done && <ProgressBar value={null} />}

          {run.attempts.length > 0 ? (
            <div className="mt-3">
              <AgentLoop attempts={run.attempts} waiting={!run.done} />
            </div>
          ) : (
            <p className="font-mono mt-3 text-[11px] text-(--ink-soft)">
              El modelo está eligiendo por dónde entrar…
            </p>
          )}

          {run.done && (
            <div className="mt-3 flex items-start gap-2 border-t-2 border-(--chrome-shadow) pt-3">
              <span aria-hidden className="text-[16px] leading-none">
                🛡️
              </span>
              <p className="font-mono text-[12px] leading-relaxed">{run.survivedMessage}</p>
            </div>
          )}
        </>
      )}
    </Window>
  )
}

function Waiting() {
  return (
    <Window title="Consola" icon="⚔️" className="min-h-[22rem]">
      <p className="font-mono text-[12px] text-(--ink-soft)">Montando la posición en el fork…</p>
      <div className="mt-3">
        <ProgressBar value={null} />
      </div>
    </Window>
  )
}

/** El momento en que la posición cae, contado como lo contaba el sistema. */
function BlueScreen({ run }: { run: VectorRun }) {
  const killer = run.attempts.findLast((a) => a.verdict === 'LIQUIDATABLE')

  return (
    <div className="font-mono text-[12px] leading-relaxed text-white">
      <p className="font-chrome mx-auto mb-4 w-fit bg-(--chrome-lit) px-2 py-[2px] text-[11px] text-(--bsod)">
        Attack My DeFi
      </p>

      <p>Tu posición dejó de responder.</p>

      <p className="mt-3 pl-4">
        Alcanza con <span className="text-[15px] font-semibold">{run.thresholdLabel}</span>
        {killer && <> para dejarte en HF {hf(killer.healthFactor)}</>}.
      </p>

      {run.attackerProfitUsd !== undefined && (
        <p className="mt-3 pl-4">
          Quien te liquide se lleva{' '}
          <span className="text-[15px] font-semibold">{usd(run.attackerProfitUsd)}</span> si el
          precio venía de un feed y no del mercado.
        </p>
      )}

      <p className="mt-4">
        {run.attempts.length} sondeos contra el fork. Cada health factor lo devolvió el contrato
        de Aave.
      </p>

      <p className="mt-4">
        Presione cualquier tecla para continuar <span className="blink">_</span>
      </p>
    </div>
  )
}
