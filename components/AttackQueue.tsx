'use client'

type AttackState = 'pending' | 'running' | 'survived' | 'breached'

export interface QueueItem {
  id: string
  label: string
  state: AttackState
  /** Con qué se rompió, si se rompió. */
  thresholdLabel: string | null
  probes: number
}

const MARK: Record<AttackState, string> = {
  pending: '·',
  running: '▶',
  survived: '✓',
  breached: '☠',
}

const TONE: Record<AttackState, string> = {
  pending: 'var(--chrome-shadow)',
  running: 'var(--ink)',
  survived: 'var(--hp-high)',
  breached: 'var(--hp-low)',
}

/**
 * Los ataques como cola, no como lista que crece.
 *
 * Se corren de a uno porque el fork es un recurso exclusivo: no hay seis
 * agentes en paralelo y mostrarlos así sería mentir sobre lo que hace el
 * sistema. Lo que sí se puede mostrar —y es más honesto y más claro— es la cola
 * completa desde el arranque, con cuál está corriendo y qué dejó cada uno.
 */
export function AttackQueue({
  items,
  focused,
  onFocus,
}: {
  items: QueueItem[]
  focused: string | null
  onFocus: (id: string) => void
}) {
  return (
    <ul className="flex flex-col gap-[2px]">
      {items.map((item) => {
        const isFocused = item.id === focused
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onFocus(item.id)}
              aria-current={isFocused}
              className={`btn font-mono w-full px-2 py-[6px] text-left text-[11px] ${
                isFocused ? 'sunken bg-(--field)' : 'raised'
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span aria-hidden style={{ color: TONE[item.state] }}>
                  {MARK[item.state]}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </span>
              <span className="mt-[2px] block pl-5 text-[10px] text-(--ink-soft)">
                {describe(item)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function describe(item: QueueItem): string {
  switch (item.state) {
    case 'pending':
      return 'en espera'
    case 'running':
      return item.probes ? `sondeo ${item.probes}` : 'preparando'
    case 'survived':
      return 'aguantó'
    case 'breached':
      return item.thresholdLabel ?? 'rompió'
  }
}
