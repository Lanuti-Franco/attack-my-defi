'use client'

import type { Strategy } from '@/lib/schemas/strategy'
import { Button } from '@/components/win95/Window'

const ASSETS = ['WETH', 'WBTC', 'USDC'] as const

/** Posiciones de arranque, para no tener que tipear antes de ver algo. */
const PRESETS: { label: string; strategy: Strategy }[] = [
  {
    label: '100 ETH → 150k USDC',
    strategy: { collateral: { asset: 'WETH', amount: 100 }, debt: { asset: 'USDC', amount: 150_000 } },
  },
  {
    label: '5 BTC → 200k USDC',
    strategy: { collateral: { asset: 'WBTC', amount: 5 }, debt: { asset: 'USDC', amount: 200_000 } },
  },
]

/**
 * Qué posición poner a prueba.
 *
 * Se elige a mano y no se describe en castellano. Interpretar texto libre es
 * una fuente de error más en la parte que no es el corazón del producto: lo
 * difícil que hace el modelo es decidir cómo atacar, leer lo que devuelve la
 * cadena y refinar. Cargar dos números no necesita un modelo.
 */
export function PositionPanel({
  strategy,
  onChange,
  onAudit,
  running,
}: {
  strategy: Strategy
  onChange: (next: Strategy) => void
  onAudit: () => void
  running: boolean
}) {
  const setLeg = (leg: 'collateral' | 'debt', patch: Partial<Strategy['collateral']>) =>
    onChange({ ...strategy, [leg]: { ...strategy[leg], ...patch } })

  const sameAsset = strategy.collateral.asset === strategy.debt.asset

  return (
    <fieldset className="raised p-3">
      <legend className="font-chrome px-1 text-[10px]">Your position</legend>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Leg
          label="You deposit"
          amount={strategy.collateral.amount}
          asset={strategy.collateral.asset}
          onAmount={(amount) => setLeg('collateral', { amount })}
          onAsset={(asset) => setLeg('collateral', { asset })}
          disabled={running}
        />
        <Leg
          label="You borrow"
          amount={strategy.debt.amount}
          asset={strategy.debt.asset}
          onAmount={(amount) => setLeg('debt', { amount })}
          onAsset={(asset) => setLeg('debt', { asset })}
          disabled={running}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            onClick={() => onChange(preset.strategy)}
            disabled={running}
            className="font-mono px-2 py-1 text-[11px]"
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {sameAsset && (
        <p className="font-mono mt-3 text-[11px] text-(--hp-low)">
          Depositing and borrowing the same asset does not make an attackable position.
        </p>
      )}

      <Button
        onClick={onAudit}
        disabled={running || sameAsset}
        className="mt-4 w-full px-4 py-3 text-[14px] tracking-[0.2em]"
      >
        {running ? (
          'ATTACKING…'
        ) : (
          <>
            {/* La fuente bitmap del chrome no tiene glifo para las espadas y
                las dibuja como una equis: van con la fuente del sistema. */}
            <span className="font-sans">⚔️</span> ATTACK ME{' '}
            <span className="font-sans">⚔️</span>
          </>
        )}
      </Button>
    </fieldset>
  )
}

function Leg({
  label,
  amount,
  asset,
  onAmount,
  onAsset,
  disabled,
}: {
  label: string
  amount: number
  asset: (typeof ASSETS)[number]
  onAmount: (v: number) => void
  onAsset: (v: (typeof ASSETS)[number]) => void
  disabled: boolean
}) {
  return (
    <label className="flex-1">
      <span className="font-chrome mb-1 block text-[10px]">{label}</span>
      <div className="flex gap-1">
        <input
          type="number"
          value={amount}
          min={0}
          disabled={disabled}
          onChange={(e) => onAmount(Number(e.target.value))}
          className="sunken font-mono h-9 w-full bg-(--field) px-2 text-[14px] tabular-nums outline-none disabled:text-(--chrome-shadow)"
        />
        <select
          value={asset}
          disabled={disabled}
          onChange={(e) => onAsset(e.target.value as (typeof ASSETS)[number])}
          className="sunken font-mono h-9 bg-(--field) px-1 text-[13px] outline-none disabled:text-(--chrome-shadow)"
        >
          {ASSETS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}
