import { completion } from '@qvac/sdk'
import { GENERATION_PARAMS } from './localModel'
import { withoutNumbers } from './rationale'
import type { Grading } from '../simulation/grade'
import { completionText } from './completionText'

/**
 * La frase con la que cierra el informe, escrita por el modelo.
 *
 * Es el único texto de toda la app que el modelo redacta libremente, y está
 * puesto acá a propósito: escribir es lo que un modelo de lenguaje hace bien.
 * La calificación —sólida, frágil, temeraria— la decide el código comparando
 * contra tres días que ocurrieron de verdad; el modelo sólo le pone las
 * palabras, y le tocan distintas cada vez en lugar de una plantilla fija.
 *
 * Nada de lo que escriba puede convertirse en un dato: el texto pasa por el
 * mismo filtro que el resto, así que si intenta deslizar una cifra no llega a
 * la pantalla. Y si el modelo falla o se va por las ramas, queda la frase de
 * respaldo, que dice lo mismo sin adornos.
 */
export async function writeWarning(modelId: string, grading: Grading): Promise<string> {
  try {
    const run = completion({
      modelId,
      stream: false,
      generationParams: { ...GENERATION_PARAMS, predict: 60, temp: 0.8 },
      history: [
        {
          role: 'system',
          content:
            'You write one-line verdicts for a DeFi risk tool. Be direct and plain-spoken, ' +
            'the way a careful friend would put it. Never use numbers, percentages or ' +
            'figures of any kind. Never give financial advice or tell anyone what to buy or ' +
            'sell. One sentence, at most twenty words, no preamble and no quotes.',
        },
        {
          role: 'user',
          content:
            `A lending position was audited against real attacks. The verdict is "${grading.headline}". ` +
            `${grading.reference}\n\nWrite the one-line summary its owner should read.`,
        },
      ],
    })

    const final = await run.final
    const raw = completionText(final)
    const clean = withoutNumbers(raw.replace(/^["']|["']$/g, ''))

    // Una línea vacía, o una que se fue de largo, no sirve: mejor la de respaldo.
    if (clean.length < 12 || clean.length > 220) return grading.reference
    return clean
  } catch {
    return grading.reference
  }
}
