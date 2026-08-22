'use client'

export function StrategyInput({
  supplyWeth,
  borrowUsdc,
  onChange,
  onAttack,
  running,
}: {
  supplyWeth: number
  borrowUsdc: number
  onChange: (next: { supplyWeth: number; borrowUsdc: number }) => void
  onAttack: () => void
  running: boolean
}) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-5">
      <div className="mb-4 text-xs uppercase tracking-widest text-neutral-500">
        Tu estrategia
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field
          label="Depositás (WETH)"
          value={supplyWeth}
          step={10}
          onChange={(v) => onChange({ supplyWeth: v, borrowUsdc })}
          disabled={running}
        />
        <Field
          label="Pedís prestado (USDC)"
          value={borrowUsdc}
          step={10_000}
          onChange={(v) => onChange({ supplyWeth, borrowUsdc: v })}
          disabled={running}
        />

        <button
          onClick={onAttack}
          disabled={running}
          className="h-12 rounded-md bg-red-600 px-8 font-semibold tracking-wide text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
        >
          {running ? 'ATACANDO…' : 'ATACAME'}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  step,
  onChange,
  disabled,
}: {
  label: string
  value: number
  step: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-12 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 font-mono text-lg tabular-nums text-neutral-100 outline-none focus:border-neutral-500 disabled:text-neutral-500"
      />
    </label>
  )
}
