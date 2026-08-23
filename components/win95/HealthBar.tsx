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

/**
 * `healthFactor` es null hasta que hay una posición montada.
 *
 * La barra se dibuja igual, vacía: ocupa su lugar desde el arranque y deja ver
 * que ahí va a pasar algo, en vez de aparecer de golpe y correr todo lo demás.
 */
export function HealthBar({
  healthFactor,
  label = 'Resistance',
}: {
  healthFactor: number | null
  label?: string
}) {
  const empty = healthFactor === null
  const percent = empty ? 0 : healthPercent(healthFactor)
  const dead = !empty && healthFactor < 1
  const shown = empty ? '—' : Number.isFinite(healthFactor) ? healthFactor.toFixed(4) : '∞'

  return (
    <div>
      <div className="font-chrome mb-1 flex items-baseline justify-between text-[10px]">
        <span>{label}</span>
        <span
          className="font-mono text-[12px] font-semibold tabular-nums"
          style={empty ? { color: 'var(--chrome-shadow)' } : undefined}
        >
          {dead ? 'LIQUIDATED' : `HF ${shown}`}
        </span>
      </div>

      <div className="sunken h-[16px] bg-(--field) p-[2px]">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%`, background: toneOf(percent) }}
          role="meter"
          aria-valuenow={empty ? undefined : Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={empty ? 'Health factor not measured yet' : `Health factor ${shown}`}
        />
      </div>

      {/* La escala explicada donde se mira el número, no en una nota al pie. */}
      <div className="font-mono mt-1 flex justify-between text-[10px] text-(--ink-soft)">
        <span>1.0 · liquidation</span>
        <span>2.0 · comfortable</span>
      </div>
    </div>
  )
}
