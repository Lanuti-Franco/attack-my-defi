'use client'

import type { AuditEvent } from '@/lib/schemas/strategy'
import { Window, ProgressBar } from '@/components/win95/Window'
import { ChainAnswer } from '@/components/ChainAnswer'
import { withoutNumbers } from '@/lib/ai/rationale'

type Try = Extract<AuditEvent, { type: 'combinedTry' }>

interface CombinedView {
  started: boolean
  tries: Try[]
  done: boolean
  liquidated: boolean
  failure?: string
}

/** Junta del stream lo que hace falta para mostrar el ataque combinado. */
export function combinedFrom(events: AuditEvent[]): CombinedView | null {
  const view: CombinedView = { started: false, tries: [], done: false, liquidated: false }

  for (const ev of events) {
    if (ev.type === 'combinedStart') view.started = true
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
export function CombinedAttack({
  view,
  collapseWhen,
}: {
  view: CombinedView
  collapseWhen: boolean
}) {
  return (
    <Window title="Combined attack" icon="🎯" collapseWhen={collapseWhen}>
      <p className="font-mono mb-3 text-[12px] leading-relaxed text-(--ink-soft)">
        None of these attacks liquidates your position on its own. The model looks for a mix
        that does, using less of each one than it would take to break you alone.
      </p>

      {!view.done && <ProgressBar />}

      <ol className="sunken font-mono mt-3 bg-(--field) p-2 text-[12px]">
        {view.tries.map((attempt, i) => (
          <li key={i} className={i > 0 ? 'mt-2 border-t border-(--chrome) pt-2' : ''}>
            <div className="flex items-baseline gap-2">
              <span className="text-(--ink-soft) tabular-nums">{i + 1}</span>
              <span className="flex-1">
                {attempt.ingredients.map((ing) => ing.shown).join('  +  ')}
              </span>
            </div>
            {attempt.rationale && (
              <p className="mt-[2px] pl-6 text-[11px] leading-snug text-(--ink-soft)">
                “{withoutNumbers(attempt.rationale)}”
              </p>
            )}

            <ChainAnswer healthFactor={attempt.healthFactor} liquidated={attempt.liquidated} />
          </li>
        ))}

        {!view.done && (
          <li className={view.tries.length ? 'mt-2 border-t border-(--chrome) pt-2' : ''}>
            <span className="text-(--ink-soft)">
              the model is choosing what to mix <span className="blink">█</span>
            </span>
          </li>
        )}
      </ol>

      {view.done && (
        <p className="font-mono mt-3 border-t-2 border-(--chrome-shadow) pt-3 text-[12px] leading-relaxed">
          {view.failure
            ? `The search stopped: ${view.failure}`
            : view.liquidated
              ? 'It found the mix. None of those pieces breaks you on its own.'
              : `None of the ${view.tries.length} mixes it tried managed to liquidate you.`}
        </p>
      )}
    </Window>
  )
}
