'use client'

import { useState } from 'react'
import type { Strategy } from '@/lib/schemas/strategy'

const EXAMPLES = [
  'deposito 100 ETH y pido prestados 150k USDC',
  'pongo 200000 USDC de colateral y saco 62 WETH',
]

export function NaturalLanguageInput({
  onParsed,
  disabled,
}: {
  onParsed: (strategy: Strategy) => void
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function interpret(value?: string) {
    const input = (value ?? text).trim()
    if (!input) return
    setText(input)
    setBusy(true)
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
      onParsed(data.strategy as Strategy)
    } catch {
      setProblem('No pude contactar al modelo local')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-5">
      <div className="mb-3 text-xs uppercase tracking-widest text-neutral-500">
        Contá tu estrategia
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          disabled={disabled || busy}
          placeholder="deposito 100 ETH y pido prestados 150k USDC"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && interpret()}
          className="h-12 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:text-neutral-500"
        />
        <button
          onClick={() => interpret()}
          disabled={disabled || busy || !text.trim()}
          className="h-12 rounded-md border border-neutral-600 px-5 text-sm font-medium text-neutral-200 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Leyendo…' : 'Interpretar'}
        </button>
      </div>

      {problem && <p className="mt-3 text-xs text-amber-400">{problem}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => interpret(e)}
            disabled={disabled || busy}
            className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-500 transition hover:border-neutral-600 hover:text-neutral-300 disabled:opacity-40"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
