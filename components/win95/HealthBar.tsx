'use client'

/**
 * El health factor como barra de vida.
 *
 * "Health factor 1,3369" no le dice nada a nadie que no venga de Aave, pero una
 * barra a media asta se entiende sin explicación. La escala es la que importa
 * de verdad: 1,0 es el punto exacto en el que Aave te liquida, así que ahí la
 * barra está vacía. De 2,0 para arriba está llena, porque más holgura que esa
 * ya no cambia ninguna decisión.
 */
function healthPercent(healthFactor: number): number {
  if (!Number.isFinite(healthFactor)) return 100
  return Math.min(100, Math.max(0, (healthFactor - 1) * 100))
}

function toneOf(percent: number): string {
  if (percent > 50) return 'var(--hp-high)'
  if (percent > 20) return 'var(--hp-mid)'
  return 'var(--hp-low)'
}

export function HealthBar({
  healthFactor,
  label = 'Resistencia',
}: {
  healthFactor: number
  label?: string
}) {
  const percent = healthPercent(healthFactor)
  const dead = healthFactor < 1
  const shown = Number.isFinite(healthFactor) ? healthFactor.toFixed(4) : '∞'

  return (
    <div>
      <div className="font-chrome mb-1 flex items-baseline justify-between text-[10px]">
        <span>{label}</span>
        <span className="font-mono text-[12px] font-semibold tabular-nums">
          {dead ? 'LIQUIDADA' : `HF ${shown}`}
        </span>
      </div>

      <div className="sunken h-[16px] bg-(--field) p-[2px]">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%`, background: toneOf(percent) }}
          role="meter"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Health factor ${shown}`}
        />
      </div>

      {/* La escala explicada donde se mira el número, no en una nota al pie. */}
      <div className="font-mono mt-1 flex justify-between text-[10px] text-(--ink-soft)">
        <span>1,0 · te liquidan</span>
        <span>2,0 · holgado</span>
      </div>
    </div>
  )
}
