import { completion } from '@qvac/sdk'
import { GENERATION_PARAMS } from './localModel'
import { withoutNumbers } from './rationale'
import type { Grading } from '../simulation/grade'
import { completionText } from './completionText'

/**
 * La frase de cierre, y el único texto que el modelo redacta libremente.
 *
 * La calificación la decide el código contra tres días reales; el modelo sólo
 * le pone palabras, distintas cada vez. Pasa por el filtro de números, así que
 * no puede deslizar una cifra, y si falla queda la frase de respaldo.
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
