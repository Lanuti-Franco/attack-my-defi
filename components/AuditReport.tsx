'use client'

import type { AuditEvent, RecommendationView } from '@/lib/schemas/strategy'

const usd = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const hf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))

interface VectorRun {
  id: string
  label: string
  premise: string
  attempts: Extract<AuditEvent, { type: 'attempt' }>[]
  thresholdLabel: string | null
  attackerProfitUsd?: number
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

export function AuditReport({ events }: { events: AuditEvent[] }) {
  const { position, vectors, recommendations, errors } = build(events)
  if (!position && !errors.length) return null

  return (
    <div className="flex flex-col gap-6">
      {position && (
        <section className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-5">
          <div className="mb-3 text-xs uppercase tracking-widest text-neutral-500">
            Posición montada en el fork
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat label="Colateral" value={usd(position.collateralUsd)} />
            <Stat label="Deuda" value={usd(position.debtUsd)} />
            <Stat
              label="Liq. threshold"
              value={`${(position.liquidationThreshold * 100).toFixed(0)}%`}
            />
            <Stat label="Health factor" value={hf(position.healthFactor)} accent />
          </div>
        </section>
      )}

      {vectors.map((v) => (
        <section key={v.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">{v.label}</h3>
              <p className="mt-0.5 text-xs text-neutral-500">{v.premise}</p>
            </div>
            {v.done && (
              <span className="font-mono text-lg tabular-nums text-red-400">
                {v.thresholdLabel ?? 'no la liquida'}
              </span>
            )}
          </div>

          {v.attempts.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {v.attempts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded px-2 py-1 font-mono text-xs ${
                    a.verdict === 'LIQUIDATABLE' ? 'bg-red-950/30' : 'bg-emerald-950/20'
                  }`}
                >
                  <span className="w-40 shrink-0 text-neutral-400">{a.label}</span>
                  <span className="flex-1 tabular-nums text-neutral-200">HF {hf(a.healthFactor)}</span>
                  <span
                    className={
                      a.verdict === 'LIQUIDATABLE'
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }
                  >
                    {a.verdict === 'LIQUIDATABLE' ? 'LIQUIDABLE' : 'SOBREVIVE'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {v.attackerProfitUsd !== undefined && (
            <div className="mt-3 flex items-baseline gap-2 border-t border-neutral-800 pt-3">
              <span className="text-xs uppercase tracking-widest text-neutral-500">
                Se lleva el atacante
              </span>
              <span className="font-mono text-lg tabular-nums text-amber-400">
                {usd(v.attackerProfitUsd)}
              </span>
            </div>
          )}
        </section>
      ))}

      {recommendations.length > 0 && (
        <section className="rounded-lg border border-neutral-600 bg-neutral-900 p-5">
          <div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">
            Qué hacer al respecto
          </div>
          <p className="mb-4 text-xs text-neutral-500">
            La pregunta no es cuánto puede caer el precio, sino a qué querés sobrevivir.
          </p>

          <div className="flex flex-col gap-3">
            {recommendations.map((r) => (
              <div
                key={r.profileId}
                className="rounded-md border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-100">{r.profileLabel}</span>
                  <span className="text-xs text-neutral-500">sobrevive {r.benchmark}</span>
                </div>

                {r.alreadySafe ? (
                  <p className="mt-2 text-sm text-emerald-400">
                    Tu posición ya lo aguanta, con health factor {hf(r.resultingHealthFactor)}.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="font-mono text-2xl tabular-nums text-neutral-100">
                      repagá {usd(r.repayUsd)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      deuda máxima {usd(r.maxDebtUsd)} · quedarías en HF{' '}
                      {hf(r.resultingHealthFactor)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {errors.map((e, i) => (
        <div
          key={i}
          className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200"
        >
          {e}
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`font-mono text-xl tabular-nums ${accent ? 'text-emerald-400' : 'text-neutral-100'}`}
      >
        {value}
      </div>
    </div>
  )
}
