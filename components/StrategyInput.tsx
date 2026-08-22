'use client'

import type { Strategy } from '@/lib/schemas/strategy'
import type { AttackVector } from '@/lib/ai/vectors'

const ASSETS = ['WETH', 'USDC'] as const

export function StrategyInput({
  strategy,
  onChange,
  vectors,
  selectedVector,
  onSelectVector,
  onAttack,
  running,
}: {
  strategy: Strategy
  onChange: (next: Strategy) => void
  vectors: AttackVector[]
  selectedVector: string
  onSelectVector: (id: string) => void
  onAttack: () => void
  running: boolean
}) {
  const setLeg = (leg: 'collateral' | 'debt', patch: Partial<Strategy['collateral']>) =>
    onChange({ ...strategy, [leg]: { ...strategy[leg], ...patch } })

  const sameAsset = strategy.collateral.asset === strategy.debt.asset

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-5">
      <div className="mb-4 text-xs uppercase tracking-widest text-neutral-500">Tu estrategia</div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Leg
          label="Depositás"
          amount={strategy.collateral.amount}
          asset={strategy.collateral.asset}
          onAmount={(amount) => setLeg('collateral', { amount })}
          onAsset={(asset) => setLeg('collateral', { asset })}
          disabled={running}
        />
        <Leg
          label="Pedís prestado"
          amount={strategy.debt.amount}
          asset={strategy.debt.asset}
          onAmount={(amount) => setLeg('debt', { amount })}
          onAsset={(asset) => setLeg('debt', { asset })}
          disabled={running}
        />
      </div>

      {sameAsset && (
        <p className="mt-3 text-xs text-amber-400">
          Depositar y pedir prestado el mismo activo no arma una posición atacable.
        </p>
      )}

      <div className="mt-6 mb-2 text-xs uppercase tracking-widest text-neutral-500">
        Vector de ataque
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {vectors.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelectVector(v.id)}
            disabled={running}
            className={`flex-1 rounded-md border px-4 py-3 text-left transition disabled:opacity-50 ${
              selectedVector === v.id
                ? 'border-red-600 bg-red-950/30'
                : 'border-neutral-700 bg-neutral-950 hover:border-neutral-500'
            }`}
          >
            <div className="text-sm font-semibold text-neutral-100">{v.label}</div>
            <div className="mt-1 text-xs leading-snug text-neutral-500">{v.premise}</div>
          </button>
        ))}
      </div>

      <button
        onClick={onAttack}
        disabled={running || sameAsset}
        className="mt-5 h-12 w-full rounded-md bg-red-600 font-semibold tracking-wide text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
      >
        {running ? 'ATACANDO…' : 'ATACAME'}
      </button>
    </div>
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
  asset: 'WETH' | 'USDC'
  onAmount: (v: number) => void
  onAsset: (v: 'WETH' | 'USDC') => void
  disabled: boolean
}) {
  return (
    <div className="flex-1">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          value={amount}
          min={0}
          disabled={disabled}
          onChange={(e) => onAmount(Number(e.target.value))}
          className="h-12 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 font-mono text-lg tabular-nums text-neutral-100 outline-none focus:border-neutral-500 disabled:text-neutral-500"
        />
        <select
          value={asset}
          disabled={disabled}
          onChange={(e) => onAsset(e.target.value as 'WETH' | 'USDC')}
          className="h-12 rounded-md border border-neutral-700 bg-neutral-950 px-2 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-500 disabled:text-neutral-500"
        >
          {ASSETS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
