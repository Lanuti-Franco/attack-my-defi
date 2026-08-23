'use client'

import { hf } from '@/lib/format'

/**
 * Lo que contestó la cadena a un escenario.
 *
 * Aparece igual en la búsqueda de un ataque suelto y en el combinado, y es la
 * mitad del diálogo que no hay que dejar que se vea distinta según dónde: es el
 * único número de toda la pantalla que no puede venir del modelo, y conviene
 * que se reconozca siempre igual.
 */
export function ChainAnswer({
  healthFactor,
  liquidated,
}: {
  healthFactor: number
  liquidated: boolean
}) {
  return (
    <div className="mt-[2px] flex items-baseline gap-2 pl-6">
      <span className="font-chrome text-[9px] text-(--ink-soft)">Aave</span>
      <span className="tabular-nums">HF {hf(healthFactor)}</span>
      <span
        className="font-semibold"
        style={{ color: liquidated ? 'var(--hp-low)' : 'var(--hp-high)' }}
      >
        {liquidated ? '☠ liquidates' : '🛡 holds'}
      </span>
    </div>
  )
}
