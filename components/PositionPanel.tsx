'use client'

import { useState } from 'react'
import type { Strategy } from '@/lib/schemas/strategy'
import { Button } from '@/components/win95/Window'

const ASSETS = ['WETH', 'WBTC', 'USDC'] as const

const EXAMPLES = [
  'deposito 100 ETH y pido prestados 150k USDC',
  'pongo 5 WBTC de colateral y saco 200k USDC',
  'deposito 200000 USDC y saco 62 WETH',
]

/**
 * Un solo lugar para decir qué posición querés poner a prueba.
 *
 * Se escribe en castellano y el modelo local lo interpreta; los campos de abajo
 * muestran qué entendió y se pueden corregir a mano. Antes eran dos cajas
 * separadas compitiendo por lo mismo, y no quedaba claro cuál mandaba.
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
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const setLeg = (leg: 'collateral' | 'debt', patch: Partial<Strategy['collateral']>) =>
    onChange({ ...strategy, [leg]: { ...strategy[leg], ...patch } })

  const sameAsset = strategy.collateral.asset === strategy.debt.asset
  const busy = running || reading

  async function interpret(value?: string) {
    const input = (value ?? text).trim()
    if (!input) return
    setText(input)
    setReading(true)
    setProblem(null)
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const data = await res.json()
      if (!res.ok) {
        setProblem(data.error ?? 'No pude interpretarlo')
        return
      }
      onChange(data.strategy as Strategy)
    } catch {
      setProblem('No pude contactar al modelo local')
    } finally {
      setReading(false)
    }
  }

  return (
    <fieldset className="raised p-3">
      <legend className="font-chrome px-1 text-[10px]">Tu posición</legend>

      <div className="flex flex-col gap-1 sm:flex-row">
        <input
          value={text}
          disabled={busy}
          placeholder="deposito 100 ETH y pido prestados 150k USDC"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && interpret()}
          className="sunken font-mono h-9 flex-1 bg-(--field) px-2 text-[13px] outline-none placeholder:text-(--chrome-shadow) disabled:text-(--chrome-shadow)"
        />
        <Button onClick={() => interpret()} disabled={busy || !text.trim()}>
          {reading ? 'LEYENDO…' : 'INTERPRETAR'}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => interpret(e)}
            disabled={busy}
            className="raised btn font-mono px-2 py-1 text-[11px] disabled:text-(--chrome-shadow)"
          >
            <span className="block">{e}</span>
          </button>
        ))}
      </div>

      {problem && <p className="font-mono mt-2 text-[11px] text-(--hp-low)">{problem}</p>}

      <p className="font-chrome mt-4 mb-1 text-[9px] text-(--ink-soft)">
        {reading ? 'Interpretando…' : 'Lo que se va a montar en el fork'}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Leg
          label="Depositás"
          amount={strategy.collateral.amount}
          asset={strategy.collateral.asset}
          onAmount={(amount) => setLeg('collateral', { amount })}
          onAsset={(asset) => setLeg('collateral', { asset })}
          disabled={busy}
        />
        <Leg
          label="Pedís prestado"
          amount={strategy.debt.amount}
          asset={strategy.debt.asset}
          onAmount={(amount) => setLeg('debt', { amount })}
          onAsset={(asset) => setLeg('debt', { asset })}
          disabled={busy}
        />
      </div>

      {sameAsset && (
        <p className="font-mono mt-3 text-[11px] text-(--hp-low)">
          Depositar y pedir prestado el mismo activo no arma una posición atacable.
        </p>
      )}

      <Button
        onClick={onAudit}
        disabled={busy || sameAsset}
        className="mt-4 w-full py-3 text-[14px] tracking-[0.2em]"
      >
        {running ? 'ATACANDO…' : 'ATACAME'}
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
