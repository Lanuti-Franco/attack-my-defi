'use client'

import type { ReactNode } from 'react'
import { Window } from '@/components/win95/Window'

/**
 * Lo que hay que saber antes de creerle a un número.
 *
 * La primera pregunta es la que importa y por eso va primera: quién produce las
 * cifras. Una herramienta que dice "tu posición se liquida con ETH a -25,6%"
 * sin poder responder eso no vale nada.
 */
const ENTRIES: { question: string; answer: ReactNode }[] = [
  {
    question: 'Who computes these numbers?',
    answer: (
      <>
        The Aave contract, not the model. Each scenario is applied to a fork of Ethereum mainnet
        —the price the oracle reports gets moved— and then Aave is asked for the resulting health
        factor. The model picks what to try; the chain answers what it comes to. If the model
        picks badly it takes longer to find the threshold, but it cannot invent one.
      </>
    ),
  },
  {
    question: 'Where does the model run?',
    answer: (
      <>
        Entirely on this machine, through the QVAC SDK: a quantized Qwen3 with 4 billion
        parameters, without a single call to an external API. You can unplug the internet after
        the fork is up and the audit keeps working.
      </>
    ),
  },
  {
    question: 'What does the model actually decide?',
    answer: (
      <>
        For the six individual attacks, not much: given the range where the threshold lies, the
        next value to try is the midpoint, and that is a three-line loop. Where it earns its
        place is the combined attack — finding a mix of attacks that liquidates you using less of
        each one than it would take to break you alone. There is no formula for that, and picking
        at random finds it 7 times out of 10 while the model finds it every time.
      </>
    ),
  },
  {
    question: 'Why a fork instead of the real chain?',
    answer: (
      <>
        Because you have to break the position to learn what breaks it, and on a fork that costs
        nobody anything. The block is pinned, so any two runs start from the same state of the
        world and reach the same result.
      </>
    ),
  },
  {
    question: 'What is the health factor?',
    answer: (
      <>
        How much your position can take before you get liquidated. Below 1, anyone can repay part
        of your debt and keep your collateral plus a bonus. Above 2 you are comfortable. The
        health bar above is that number.
      </>
    ),
  },
  {
    question: 'Is this financial advice?',
    answer: (
      <>
        No. It is a simulator: it tells you what happens to a position under scenarios we chose,
        on a state of the chain frozen at one block. Nothing here predicts what the market will
        do.
      </>
    ),
  },
]

export function Faq() {
  return (
    <Window title="Help — How this works" icon="❓">
      <div className="flex flex-col gap-[2px]">
        {ENTRIES.map(({ question, answer }) => (
          <details key={question} className="sunken bg-(--field)">
            <summary className="font-chrome cursor-pointer px-2 py-[6px] text-[10px] leading-normal">
              {question}
            </summary>
            <p className="font-mono border-t border-(--chrome-shadow) px-2 py-2 text-[12px] leading-relaxed">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </Window>
  )
}
