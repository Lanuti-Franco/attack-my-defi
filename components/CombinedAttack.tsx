'use client'

import type { AuditEvent } from '@/lib/schemas/strategy'
import { Window, ProgressBar } from '@/components/win95/Window'

const hf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))

type Try = Extract<AuditEvent, { type: 'combinedTry' }>

export interface CombinedView {
  started: boolean
  available: { id: string; label: string }[]
  tries: Try[]
  done: boolean
  liquidated: boolean
  failure?: string
}

/** Junta del stream lo que hace falta para mostrar el ataque combinado. */
export function combinedFrom(events: AuditEvent[]): CombinedView | null {
  const view: CombinedView = {
    started: false,
    available: [],
    tries: [],
    done: false,
    liquidated: false,
  }

  for (const ev of events) {
    if (ev.type === 'combinedStart') {
      view.started = true
      view.available = ev.available
    }
    if (ev.type === 'combinedTry') view.tries.push(ev)
    if (ev.type === 'combinedDone') {
      view.done = true
      view.liquidated = ev.liquidated
      view.failure = ev.failure
    }
  }

  return view.started ? view : null
}

/**
 * El ataque combinado.
 *
 * Es el único donde el modelo hace algo que el código no podría hacer igual de
 * bien, y por eso se muestra distinto: no hay un umbral que encontrar, hay una
 * mezcla que probar. Cada intento se lee entero —qué mezcló, con qué fuerza y
 * qué contestó Aave— porque lo interesante es el criterio, no el número final.
 */
export function CombinedAttack({ view }: { view: CombinedView }) {
  return (
    <Window title="Ataque combinado" icon="🎯">
      <p className="font-mono mb-3 text-[12px] leading-relaxed text-(--ink-soft)">
        Ninguno de estos ataques liquida tu posición por su cuenta. El modelo busca una mezcla
        que sí, usando de cada uno menos de lo que haría falta para romperte solo.
      </p>

      {!view.done && <ProgressBar value={null} />}

      <ol className="sunken font-mono mt-3 bg-(--field) p-2 text-[12px]">
        {view.tries.map((attempt, i) => (
          <li key={i} className={i > 0 ? 'mt-2 border-t border-(--chrome) pt-2' : ''}>
            <div className="flex items-baseline gap-2">
              <span className="text-(--ink-soft) tabular-nums">{i + 1}</span>
              <span className="flex-1">
                {attempt.ingredients.map((ing) => ing.shown).join('  +  ')}
              </span>
            </div>
            <div className="mt-[2px] flex items-baseline gap-2 pl-6">
              <span className="font-chrome text-[9px] text-(--ink-soft)">Aave</span>
              <span className="tabular-nums">HF {hf(attempt.healthFactor)}</span>
              <span
                className="font-semibold"
                style={{ color: attempt.liquidated ? 'var(--hp-low)' : 'var(--hp-high)' }}
              >
                {attempt.liquidated ? '☠ liquida' : '🛡 aguanta'}
              </span>
            </div>
          </li>
        ))}

        {!view.done && (
          <li className={view.tries.length ? 'mt-2 border-t border-(--chrome) pt-2' : ''}>
            <span className="text-(--ink-soft)">
              el modelo está eligiendo qué mezclar <span className="blink">█</span>
            </span>
          </li>
        )}
      </ol>

      {view.done && (
        <p className="font-mono mt-3 border-t-2 border-(--chrome-shadow) pt-3 text-[12px] leading-relaxed">
          {view.failure
            ? `La búsqueda se cortó: ${view.failure}`
            : view.liquidated
              ? 'Encontró la mezcla. Ninguna de esas piezas te rompe sola.'
              : `Ninguna de las ${view.tries.length} mezclas que probó llegó a liquidarte.`}
        </p>
      )}
    </Window>
  )
}
