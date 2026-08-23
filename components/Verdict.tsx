'use client'

import type { AuditEvent, RecommendationView } from '@/lib/schemas/strategy'
import { Window } from '@/components/win95/Window'
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
export function Verdict({
  breaches,
  vectorsRun,
  recommendation,
  forkBlock,
}: {
  breaches: Breach[]
  vectorsRun: number
  recommendation: RecommendationView | null
  forkBlock: string
}) {
  const cheapest = breaches.reduce<Breach | null>(
    (best, b) => (best === null || b.severity < best.severity ? b : best),
    null,
  )
  const broken = breaches.length

  return (
    <Window title="Resultado del asedio" icon={broken ? '☠️' : '🛡️'} opening>
      <p className="font-chrome text-[15px] leading-normal">
        {broken > 0
          ? `Encontré ${broken} ${broken === 1 ? 'forma' : 'formas'} de romperte`
          : 'No encontré por dónde romperte'}
      </p>
      <p className="font-mono mt-1 text-[12px] text-(--ink-soft)">
        de {vectorsRun} {vectorsRun === 1 ? 'ataque probado' : 'ataques probados'}
      </p>

      {cheapest && (
        <dl className="sunken font-mono mt-3 bg-(--field) p-3 text-[13px]">
          <dt className="font-chrome text-[9px] text-(--ink-soft)">El más barato</dt>
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
            Para sobrevivir {recommendation.benchmark}
          </dt>
          {recommendation.alreadySafe ? (
            <p className="mt-1 text-(--hp-high)">
              Tu posición ya lo aguanta, con health factor{' '}
              {recommendation.resultingHealthFactor.toFixed(4)}.
            </p>
          ) : (
            <p className="mt-1 text-[17px] font-semibold">
              bajá la deuda a {usd(recommendation.maxDebtUsd)}
            </p>
          )}
        </div>
      )}

      {/* La línea que sostiene todo lo de arriba. Sin esto es una afirmación
          más; con esto es algo que cualquiera puede volver a correr. */}
      <p className="font-mono mt-3 border-t-2 border-(--chrome-shadow) pt-2 text-[11px] text-(--ink-soft)">
        Verificado contra Aave V3 sobre un fork de Ethereum mainnet · bloque {forkBlock}
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
