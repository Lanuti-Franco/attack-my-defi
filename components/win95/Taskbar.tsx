'use client'

/**
 * La barra de tareas.
 *
 * Donde el sistema ponía el reloj, acá va el bloque del fork. En una
 * herramienta cuyo argumento entero es "esto corre contra una cadena de
 * verdad", ese es el dato que se gana el lugar: el bloque está pineado, así
 * que dos corridas cualesquiera parten del mismo estado del mundo.
 */
export function Taskbar({
  forkBlock,
  tasks,
  running,
  muted,
  onToggleMute,
}: {
  forkBlock: string
  tasks: string[]
  running: boolean
  muted: boolean
  onToggleMute: () => void
}) {
  return (
    <footer className="raised fixed inset-x-0 bottom-0 z-50 flex items-center gap-1 px-1 py-[3px]">
      <span className="raised font-chrome flex items-center gap-1 px-2 py-[5px] text-[11px]">
        <span aria-hidden>🪟</span> Inicio
      </span>

      <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {tasks.map((t) => (
          <span
            key={t}
            className="sunken font-mono hidden max-w-40 truncate px-2 py-[5px] text-[11px] sm:block"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="sunken font-mono flex shrink-0 items-center gap-2 px-2 py-[5px] text-[11px]">
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          className="btn text-[12px] leading-none"
          title={muted ? 'Activar sonido' : 'Silenciar'}
        >
          <span className="block">{muted ? '🔇' : '🔊'}</span>
        </button>
        <span
          aria-hidden
          className={running ? 'blink' : ''}
          style={{ color: running ? 'var(--hp-mid)' : 'var(--hp-high)' }}
        >
          ●
        </span>
        <span className="tabular-nums">bloque {forkBlock}</span>
      </div>
    </footer>
  )
}
