'use client'

import type { AuditEvent } from '@/lib/schemas/strategy'
import { hf } from '@/lib/format'

type Attempt = Extract<AuditEvent, { type: 'attempt' }>

/**
 * El ida y vuelta entre el modelo y la cadena, paso por paso.
 *
 * Es la parte que hay que poder ver para creerle al resultado. Una lista de
 * intentos con su health factor parece un puñado de pruebas predeterminadas;
 * lo que muestra que hay una búsqueda es el turno: el modelo propone un
 * escenario y dice por qué, la cadena responde con un número que el modelo no
 * eligió, y el modelo usa esa respuesta para decidir el paso siguiente.
 *
 * Por eso cada paso son dos líneas y no una. Quién dice qué es la información.
 */
export function AgentLoop({ attempts, waiting }: { attempts: Attempt[]; waiting: boolean }) {
  return (
    <ol className="sunken font-mono max-h-64 overflow-y-auto bg-(--field) p-2 text-[12px]">
      {attempts.map((attempt, i) => (
        <li key={i} className={i > 0 ? 'mt-2 border-t border-(--chrome) pt-2' : ''}>
          <div className="flex items-baseline gap-2">
            <span className="text-(--ink-soft) tabular-nums">{i + 1}</span>
            <span className="font-chrome text-[9px] text-(--ink-soft)">modelo</span>
            <span className="font-semibold">probá {attempt.label}</span>
          </div>

          {attempt.rationale && (
            <p className="mt-[2px] pl-6 text-[11px] leading-snug text-(--ink-soft)">
              “{trim(attempt.rationale)}”
            </p>
          )}

          <div className="mt-[2px] flex items-baseline gap-2 pl-6">
            <span className="font-chrome text-[9px] text-(--ink-soft)">Aave</span>
            <span className="tabular-nums">HF {hf(attempt.healthFactor)}</span>
            <span
              className="font-semibold"
              style={{
                color: attempt.verdict === 'LIQUIDATABLE' ? 'var(--hp-low)' : 'var(--hp-high)',
              }}
            >
              {attempt.verdict === 'LIQUIDATABLE' ? '☠ liquida' : '🛡 aguanta'}
            </span>
          </div>
        </li>
      ))}

      {waiting && (
        <li className={attempts.length ? 'mt-2 border-t border-(--chrome) pt-2' : ''}>
          <span className="font-chrome text-[9px] text-(--ink-soft)">modelo</span>{' '}
          <span className="text-(--ink-soft)">
            eligiendo el próximo escenario <span className="blink">█</span>
          </span>
        </li>
      )}
    </ol>
  )
}

/**
 * El modelo a veces se explaya. Una línea alcanza para entender la decisión, y
 * de paso evita que un vector empuje a los demás fuera de la pantalla.
 */
function trim(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 110 ? `${oneLine.slice(0, 108)}…` : oneLine
}
