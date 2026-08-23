/**
 * Qué tan buena es una posición.
 *
 * Preguntar si se puede liquidar no sirve: con el colateral cayendo lo
 * suficiente se liquida cualquiera, así que "encontré cómo romperte" es
 * trivialmente cierto y no distingue una posición sólida de una temeraria.
 *
 * La pregunta que sí distingue es si el shock que la voltea es más chico o más
 * grande que lo que ya pasó. Por eso la vara no la elegimos nosotros: son tres
 * días que ocurrieron, y la posición se ubica entre ellos.
 */
export type Grade = 'solid' | 'reasonable' | 'fragile' | 'reckless'

interface Step {
  grade: Grade
  /** Caída de colateral que hay que aguantar para llegar acá, en porcentaje. */
  survives: number
  headline: string
  reference: string
}

/**
 * De más exigente a menos. Los tres números son eventos reales: Black Thursday
 * del 12 de marzo de 2020, el crash del 19 de mayo de 2021, y un mal día
 * cualquiera, que en cripto es un 20%.
 */
const LADDER: Step[] = [
  {
    grade: 'solid',
    survives: 50,
    headline: 'Solid',
    reference: 'It survives Black Thursday, the worst day Aave has seen.',
  },
  {
    grade: 'reasonable',
    survives: 35,
    headline: 'Reasonable',
    reference: 'It survives the May 2021 crash, but not a collapse like March 2020.',
  },
  {
    grade: 'fragile',
    survives: 20,
    headline: 'Fragile',
    reference: 'It takes a bad day, but a real crash like May 2021 would end it.',
  },
]

const RECKLESS: Step = {
  grade: 'reckless',
  survives: 0,
  headline: 'Reckless',
  reference: 'A bad ordinary day is enough to liquidate it.',
}

export interface Grading {
  grade: Grade
  headline: string
  reference: string
}

/**
 * Ubica la posición según la caída de colateral que aguanta.
 *
 * `dropThatLiquidates` viene en porcentaje negativo —el umbral que devolvió el
 * ataque de precio— o null cuando ni el peor escenario probado la liquidó.
 */
export function gradeFor(dropThatLiquidates: number | null): Grading {
  // Si el ataque más duro no la voltea, aguanta más que cualquier día real.
  if (dropThatLiquidates === null) {
    return {
      grade: 'solid',
      headline: 'Solid',
      reference: 'No drop we tested liquidates it, including ones deeper than any day on record.',
    }
  }

  const survives = Math.abs(dropThatLiquidates)
  const step = LADDER.find((s) => survives >= s.survives) ?? RECKLESS
  return { grade: step.grade, headline: step.headline, reference: step.reference }
}
