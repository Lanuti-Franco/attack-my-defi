'use client'

import type { AuditEvent, RecommendationView } from '@/lib/schemas/strategy'
import { Window, ProgressBar } from '@/components/win95/Window'
import { HealthBar } from '@/components/win95/HealthBar'
import { Verdict, breachesFrom } from '@/components/Verdict'

const usd = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const hf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))

/**
 * Cada vector ataca de una forma distinta, y el ícono lo dice antes que el
 * texto: la catapulta pega de frente, el ariete es la masa que arrastra, el
 * reloj es el asedio que gana esperando.
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
}

/** Reconstruye el informe a partir del stream de eventos. */
function build(events: AuditEvent[]) {
  const vectors: VectorRun[] = []
  let position: Extract<AuditEvent, { type: 'position' }> | null = null
  let recommendations: RecommendationView[] = []
  const errors: string[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'position':
        position = ev
        break
      case 'vectorStart':
        vectors.push({
          id: ev.vectorId,
          label: ev.label,
          premise: ev.premise,
          attempts: [],
          thresholdLabel: null,
          survivedMessage: '',
          done: false,
        })
        break
      case 'attempt':
        vectors.find((v) => v.id === ev.vectorId)?.attempts.push(ev)
        break
      case 'vectorDone': {
        const v = vectors.find((x) => x.id === ev.vectorId)
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
  return { position, vectors, recommendations, errors }
}

export function AuditReport({
  events,
  forkBlock,
}: {
  events: AuditEvent[]
  forkBlock: string
}) {
  const { position, vectors, recommendations, errors } = build(events)
  if (!position && !errors.length) return null

  // Las recomendaciones son lo último que emite la auditoría: hasta que no
  // llegan, todavía hay ataques corriendo y cualquier resumen sería parcial.
  const finished = recommendations.length > 0

  return (
    <div className="flex flex-col gap-5">
      {position && (
        <Window title="Tu posición — Aave V3" icon="🏰" opening>
          <HealthBar healthFactor={position.healthFactor} label="Resistencia de la posición" />

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Stat label="Colateral" value={usd(position.collateralUsd)} />
            <Stat label="Deuda" value={usd(position.debtUsd)} />
            <Stat
              label="Umbral de liquidación"
              value={`${(position.liquidationThreshold * 100).toFixed(0)}%`}
            />
          </dl>
        </Window>
      )}

      {finished && (
        <Verdict
          breaches={breachesFrom(events)}
          vectorsRun={vectors.length}
          recommendation={recommendations.find((r) => !r.alreadySafe) ?? recommendations[0] ?? null}
          forkBlock={forkBlock}
        />
      )}

      {vectors.map((v, i) => (
        <VectorWindow key={v.id} run={v} index={i} />
      ))}

      {recommendations.length > 0 && <Recommendations items={recommendations} />}

      {errors.map((e, i) => (
        <Window key={i} title="Error" icon="⛔">
          <p className="font-mono text-[12px] leading-relaxed">{e}</p>
        </Window>
      ))}
    </div>
  )
}

/**
 * Una ventana por vector. Mientras ataca muestra los intentos que va haciendo;
 * si encuentra por dónde entrar, la ventana se convierte en la pantalla azul
 * del sistema, que es lo que significa: tu posición dejó de responder.
 */
function VectorWindow({ run, index }: { run: VectorRun; index: number }) {
  const dead = run.done && run.thresholdLabel !== null
  const last = run.attempts.at(-1)

  return (
    <Window
      title={run.label}
      icon={UNIT[run.id] ?? '⚔️'}
      tone={dead ? 'dead' : 'normal'}
      active={!run.done || dead}
      opening
      className={index > 0 ? 'sm:ml-6' : ''}
    >
      {dead ? (
        <BlueScreen run={run} />
      ) : (
        <>
          <p className="font-mono mb-3 text-[12px] leading-relaxed text-(--ink-soft)">
            {run.premise}
          </p>

          {!run.done && <ProgressBar value={null} />}

          {run.attempts.length > 0 && (
            <ol className="sunken font-mono mt-3 max-h-44 overflow-y-auto bg-(--field) p-2 text-[12px]">
              {run.attempts.map((a, i) => (
                <li key={i} className="flex items-baseline gap-2 py-[2px]">
                  <span aria-hidden className="w-3 shrink-0">
                    {a.verdict === 'LIQUIDATABLE' ? '☠' : '·'}
                  </span>
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="tabular-nums">HF {hf(a.healthFactor)}</span>
                </li>
              ))}
              {!run.done && (
                <li aria-hidden className="blink py-[2px] pl-5">
                  █
                </li>
              )}
            </ol>
          )}

          {!run.done && !run.attempts.length && (
            <p className="font-mono mt-2 text-[11px] text-(--ink-soft)">
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

          {last && !run.done && (
            <p className="font-mono mt-2 text-[11px] text-(--ink-soft)">
              último sondeo: {last.label}
            </p>
          )}
        </>
      )}
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

      <p className="mt-3">
        El ataque que la volteó: <span className="font-semibold">{run.label}</span>.
      </p>

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
        Se hicieron {run.attempts.length} sondeos contra el fork. Cada health factor lo devolvió
        el contrato de Aave.
      </p>

      <p className="mt-4">
        Presione cualquier tecla para continuar <span className="blink">_</span>
      </p>
    </div>
  )
}

/** El cierre: no cuánto puede caer el precio, sino a qué querés sobrevivir. */
function Recommendations({ items }: { items: RecommendationView[] }) {
  return (
    <Window title="Qué hacer al respecto — Bloc de notas" icon="📝" opening>
      <p className="font-mono mb-3 text-[12px] leading-relaxed text-(--ink-soft)">
        La pregunta no es cuánto puede caer el precio, sino a qué querés sobrevivir.
      </p>

      <div className="flex flex-col gap-2">
        {items.map((r) => (
          <div key={r.profileId} className="sunken bg-(--field) p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-chrome text-[11px]">{r.profileLabel}</span>
              <span className="font-mono text-[11px] text-(--ink-soft)">
                sobrevive {r.benchmark}
              </span>
            </div>

            {r.alreadySafe ? (
              <p className="font-mono mt-2 text-[12px] text-(--hp-high)">
                Tu posición ya lo aguanta, con health factor {hf(r.resultingHealthFactor)}.
              </p>
            ) : (
              <p className="font-mono mt-2 text-[12px]">
                <span className="text-[17px] font-semibold tabular-nums">
                  repagá {usd(r.repayUsd)}
                </span>
                <span className="mt-1 block text-(--ink-soft)">
                  deuda máxima {usd(r.maxDebtUsd)} · quedarías en HF {hf(r.resultingHealthFactor)}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </Window>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-chrome text-[9px] text-(--ink-soft)">{label}</dt>
      <dd className="font-mono text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
