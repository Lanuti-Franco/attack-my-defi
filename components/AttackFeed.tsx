'use client'

import type { AttackEvent } from '@/lib/schemas/strategy'

const fmtUsd = (n: number) =>
  n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

const fmtHf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))

export function AttackFeed({ events }: { events: AttackEvent[] }) {
  return (
    <div className="flex flex-col gap-3">
      {events.map((ev, i) => {
        switch (ev.type) {
          case 'position':
            return (
              <div
                key={i}
                className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-4"
              >
                <div className="mb-3 text-xs uppercase tracking-widest text-neutral-500">
                  Posición montada en el fork
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                  <Stat label="Colateral" value={`$${fmtUsd(ev.collateralUsd)}`} />
                  <Stat label="Deuda" value={`$${fmtUsd(ev.debtUsd)}`} />
                  <Stat
                    label="Liq. threshold"
                    value={`${(ev.liquidationThreshold * 100).toFixed(0)}%`}
                  />
                  <Stat label="Health factor" value={fmtHf(ev.healthFactor)} accent />
                </div>
              </div>
            )

          case 'thinking':
            return (
              <div key={i} className="flex gap-3 px-1 text-neutral-300">
                <span className="shrink-0 text-neutral-600">▸</span>
                <p className="text-sm leading-relaxed">{ev.text}</p>
              </div>
            )

          case 'attempt': {
            const dead = ev.verdict === 'LIQUIDATABLE'
            return (
              <div
                key={i}
                className={`flex items-center gap-4 rounded-lg border px-4 py-3 font-mono text-sm ${
                  dead
                    ? 'border-red-900/60 bg-red-950/30'
                    : 'border-emerald-900/60 bg-emerald-950/20'
                }`}
              >
                <span className="w-24 shrink-0 text-neutral-400">
                  ETH {ev.shockPct.toFixed(1)}%
                </span>
                <span className="w-28 shrink-0 text-neutral-500">
                  ${fmtUsd(ev.collateralUsd)}
                </span>
                <span className="flex-1 text-lg tabular-nums text-neutral-100">
                  HF {fmtHf(ev.healthFactor)}
                </span>
                <span
                  className={`shrink-0 text-xs font-semibold tracking-wider ${
                    dead ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {dead ? 'LIQUIDABLE' : 'SOBREVIVE'}
                </span>
              </div>
            )
          }

          case 'conclusion':
            return (
              <div
                key={i}
                className="rounded-lg border border-neutral-600 bg-neutral-900 p-5"
              >
                {ev.minimalShockPct !== null && (
                  <>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">
                      Shock mínimo que la liquida
                    </div>
                    <div className="my-2 font-mono text-5xl font-bold tabular-nums text-red-400">
                      {ev.minimalShockPct.toFixed(1)}%
                    </div>
                  </>
                )}
                <p className="text-sm leading-relaxed text-neutral-300">{ev.text}</p>
              </div>
            )

          case 'error':
            return (
              <div
                key={i}
                className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200"
              >
                {ev.message}
              </div>
            )
        }
      })}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`font-mono text-xl tabular-nums ${
          accent ? 'text-emerald-400' : 'text-neutral-100'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
