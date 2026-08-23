'use client'

import type { AuditEvent, RecommendationView } from '@/lib/schemas/strategy'
import { Window } from '@/components/win95/Window'
import type { Grading } from '@/lib/simulation/grade'
import { usd } from '@/lib/format'

interface Breach {
  label: string
  thresholdLabel: string
  severity: number
  healthFactor: number | null
}

/**
 * El cierre de la auditoría: cuántas formas hay de romper la posición, cuál es
 * la más barata, y qué habría que hacer.
 *
 * "Más barata" se decide por severidad, no por el número que muestra cada
 * ataque: -27% de ETH y una venta de 5.000 WETH no comparten escala, pero qué
 * tan lejos está cada uno de un mundo tranquilo sí se puede comparar.
 */
/** El color de la calificación, del verde de una posición sana al rojo. */
const GRADE_TONE: Record<Grading['grade'], string> = {
  solid: 'var(--hp-high)',
  reasonable: 'var(--hp-high)',
  fragile: 'var(--hp-mid)',
  reckless: 'var(--hp-low)',
}

export function Verdict({
  breaches,
  vectorsRun,
  recommendation,
  forkBlock,
  incomplete,
  grading,
}: {
  breaches: Breach[]
  vectorsRun: number
  recommendation: RecommendationView | null
  forkBlock: string
  /** Si algo no se pudo medir: un ataque que falló, o una recomendación sin re-simular. */
  incomplete: boolean
  grading: (Grading & { warning: string }) | null
}) {
  const cheapest = breaches.reduce<Breach | null>(
    (best, b) => (best === null || b.severity < best.severity ? b : best),
    null,
  )
  const broken = breaches.length

  return (
    <Window title="Siege result" icon={broken ? '☠️' : '🛡️'} opening>
      {/* La calificación va primero y grande. "Encontré dos formas de
          romperte" es trivialmente cierto para cualquier posición —con el
          colateral cayendo lo suficiente se liquida cualquiera—; lo que
          responde algo es contra qué día de la historia se la compara. */}
      {grading && (
        <div className="mb-3">
          <p
            className="font-chrome text-[26px] leading-none"
            style={{ color: GRADE_TONE[grading.grade] }}
          >
            {grading.headline}
          </p>
          <p className="font-mono mt-2 text-[13px] leading-relaxed">{grading.warning}</p>
          <p className="font-mono mt-1 text-[11px] text-(--ink-soft)">{grading.reference}</p>
        </div>
      )}

      <p className="font-chrome border-t-2 border-(--chrome-shadow) pt-3 text-[11px] leading-normal">
        {broken > 0
          ? `${broken} ${broken === 1 ? 'way' : 'ways'} in, out of ${vectorsRun} attacks tried`
          : `No way in, out of ${vectorsRun} attacks tried`}
      </p>

      {cheapest && (
        <dl className="sunken font-mono mt-3 bg-(--field) p-3 text-[13px]">
          <dt className="font-chrome text-[9px] text-(--ink-soft)">The cheapest one</dt>
          <dd className="mt-1 text-[17px] font-semibold">
            {cheapest.label} · {cheapest.thresholdLabel}
          </dd>
          {cheapest.healthFactor !== null && (
            <dd className="mt-1 tabular-nums">
              Health factor {cheapest.healthFactor.toFixed(4)} ·{' '}
              <span className="font-semibold text-(--hp-low)">LIQUIDABLE</span>
            </dd>
          )}
        </dl>
      )}

      {recommendation && (
        <div className="sunken font-mono mt-2 bg-(--field) p-3 text-[13px]">
          <dt className="font-chrome text-[9px] text-(--ink-soft)">
            To survive {recommendation.benchmark}
          </dt>
          {recommendation.alreadySafe ? (
            <p className="mt-1 text-(--hp-high)">
              Your position already takes it, at health factor{' '}
              {recommendation.resultingHealthFactor.toFixed(4)}.
            </p>
          ) : (
            <p className="mt-1 text-[17px] font-semibold">
              bring the debt down to {usd(recommendation.maxDebtUsd)}
            </p>
          )}
          {!recommendation.verified && (
            <p className="mt-1 text-[11px] text-(--ink-soft)">not re-simulated</p>
          )}
        </div>
      )}

      {/* La línea que sostiene todo lo de arriba. Sin esto es una afirmación
          más; con esto es algo que cualquiera puede volver a correr.
          Por lo mismo no puede aparecer cuando la verificación no ocurrió. */}
      <p className="font-mono mt-3 border-t-2 border-(--chrome-shadow) pt-2 text-[11px] text-(--ink-soft)">
        {incomplete || (recommendation && !recommendation.verified)
          ? `Measured against Aave V3 on an Ethereum mainnet fork · block ${forkBlock}. Part of this audit could not be completed, so some of it is missing or unverified — see the attacks above.`
          : `Verified against Aave V3 on an Ethereum mainnet fork · block ${forkBlock}`}
      </p>
    </Window>
  )
}

/** Los vectores que encontraron por dónde entrar, listos para comparar. */
export function breachesFrom(events: AuditEvent[]): Breach[] {
  const breaches: Breach[] = []

  for (const ev of events) {
    if (ev.type !== 'vectorDone' || ev.thresholdLabel === null || ev.severity === null) continue

    // El health factor del sondeo que la volteó: el que prueba que liquida.
    const kill = events.findLast(
      (e) => e.type === 'attempt' && e.vectorId === ev.vectorId && e.verdict === 'LIQUIDATABLE',
    )

    breaches.push({
      label: ev.label,
      thresholdLabel: ev.thresholdLabel,
      severity: ev.severity,
      healthFactor: kill?.type === 'attempt' ? kill.healthFactor : null,
    })
  }

  return breaches
}
