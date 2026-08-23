'use client'

import { useState } from 'react'
import type { AuditEvent, RecommendationView } from '@/lib/schemas/strategy'
import { Window, ProgressBar } from '@/components/win95/Window'
import { Verdict, breachesFrom } from '@/components/Verdict'
import { AgentLoop } from '@/components/AgentLoop'
import { AttackQueue, type QueueItem } from '@/components/AttackQueue'
import { CombinedAttack, combinedFrom } from '@/components/CombinedAttack'
import { usd, hf } from '@/lib/format'

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
  failure?: string
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
          v.failure = ev.failure
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
  if (run.thresholdLabel) return 'breached'
  // Que la búsqueda se haya roto no es que la posición aguantara.
  return run.failure ? 'failed' : 'survived'
}

export function AuditReport({
  events,
  forkBlock,
}: {
  events: AuditEvent[]
  forkBlock: string
}) {
  const { position, vectors, recommendations, errors } = build(events)

  const combined = combinedFrom(events)
  const running = vectors.find((v) => v.started && !v.done)
  const finished = recommendations.length > 0

  // El foco sigue al ataque en curso solo hasta que alguien elige otro: pisarle
  // la elección al que está leyendo un log es peor que no seguir nada.
  const [chosen, setChosen] = useState<string | null>(null)

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
          incomplete={vectors.some((v) => v.failure) || combined?.failure !== undefined}
        />
      )}

      {combined && <CombinedAttack view={combined} />}

      {vectors.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {focused ? <Console run={focused} /> : <Waiting />}

          <Window title="The attacks" icon="⚔️">
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

          {!run.done && <ProgressBar />}

          {run.attempts.length > 0 ? (
            <div className="mt-3">
              <AgentLoop attempts={run.attempts} waiting={!run.done} />
            </div>
          ) : (
            <p className="font-mono mt-3 text-[11px] text-(--ink-soft)">
              The model is choosing where to strike…
            </p>
          )}

          {run.done && (
            <div className="mt-3 flex items-start gap-2 border-t-2 border-(--chrome-shadow) pt-3">
              <span aria-hidden className="text-[16px] leading-none">
                {run.failure ? '⚠️' : '🛡️'}
              </span>
              <p className="font-mono text-[12px] leading-relaxed">
                {run.failure
                  ? `This attack could not be measured, so nothing can be said about it: ${run.failure}`
                  : run.survivedMessage}
              </p>
            </div>
          )}
        </>
      )}
    </Window>
  )
}

function Waiting() {
  return (
    <Window title="Console" icon="⚔️" className="min-h-[22rem]">
      <p className="font-mono text-[12px] text-(--ink-soft)">Building the position on the fork…</p>
      <div className="mt-3">
        <ProgressBar />
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

      <p>Your position has stopped responding.</p>

      <p className="mt-3 pl-4">
        <span className="text-[15px] font-semibold">{run.thresholdLabel}</span> is enough
        {killer && <> to leave you at HF {hf(killer.healthFactor)}</>}.
      </p>

      {run.attackerProfitUsd !== undefined && (
        <p className="mt-3 pl-4">
          Whoever liquidates you takes{' '}
          <span className="text-[15px] font-semibold">{usd(run.attackerProfitUsd)}</span> if the
          price came from a feed and not from the market.
        </p>
      )}

      <p className="mt-4">
        {run.attempts.length} probes against the fork. Every health factor came back from the
        Aave contract.
      </p>

      {run.failure && (
        <p className="mt-4">
          The search stopped before converging, so a milder scenario might also be enough:{' '}
          {run.failure}
        </p>
      )}

      <p className="mt-4">
        Press any key to continue <span className="blink">_</span>
      </p>
    </div>
  )
}
