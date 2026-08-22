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
    question: '¿Quién calcula estos números?',
    answer: (
      <>
        El contrato de Aave, no el modelo. Cada escenario se aplica sobre un fork de Ethereum
        mainnet —se mueve el precio que el oráculo reporta— y después se le pregunta a Aave por el
        health factor resultante. El modelo elige qué probar; la cadena responde cuánto da. Si el
        modelo se equivoca al elegir, tarda más en encontrar el umbral, pero no puede inventar uno.
      </>
    ),
  },
  {
    question: '¿Dónde corre el modelo?',
    answer: (
      <>
        Entero en esta máquina, con el SDK de QVAC: un Qwen3 de 4.000 millones de parámetros
        cuantizado, sin una sola llamada a una API externa. Podés desenchufar internet después de
        levantar el fork y la auditoría sigue funcionando igual.
      </>
    ),
  },
  {
    question: '¿Por qué un fork y no la cadena real?',
    answer: (
      <>
        Porque hay que romper la posición para saber qué la rompe, y en un fork eso no le cuesta
        nada a nadie. El bloque está pineado, así que dos corridas cualesquiera parten del mismo
        estado del mundo y dan el mismo resultado.
      </>
    ),
  },
  {
    question: '¿Qué es el health factor?',
    answer: (
      <>
        Cuánto aguanta tu posición antes de que te liquiden. Debajo de 1, cualquiera puede repagar
        parte de tu deuda y quedarse con tu colateral más un bonus. Arriba de 2 estás holgado. La
        barra de vida de arriba es ese número.
      </>
    ),
  },
  {
    question: '¿Esto es consejo financiero?',
    answer: (
      <>
        No. Es un simulador: te dice qué le pasa a una posición bajo escenarios que elegimos
        nosotros, sobre un estado de la cadena congelado en un bloque. Nada acá predice qué va a
        hacer el mercado.
      </>
    ),
  },
]

export function Faq() {
  return (
    <Window title="Ayuda — Cómo funciona esto" icon="❓">
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
