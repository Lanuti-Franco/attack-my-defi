import { z } from 'zod'

const assetSchema = z.enum(['WETH', 'USDC', 'WBTC'])

const legSchema = z.object({
  asset: assetSchema,
  amount: z.number().positive('El monto tiene que ser mayor que cero'),
})

/** Estrategia que el usuario quiere poner a prueba. */
export const strategySchema = z
  .object({
    collateral: legSchema,
    debt: legSchema,
  })
  .refine((s) => s.collateral.asset !== s.debt.asset, {
    message: 'Depositar y pedir prestado el mismo activo no arma una posición atacable',
  })

export type Strategy = z.infer<typeof strategySchema>

/** Estrategia por defecto: la posición de referencia contra la que se validó todo. */
export const DEFAULT_STRATEGY: Strategy = {
  collateral: { asset: 'WETH', amount: 100 },
  debt: { asset: 'USDC', amount: 150_000 },
}

/** Eventos que emite el ataque, para el feed en vivo. */
export type AttackEvent =
  | {
      type: 'position'
      collateralUsd: number
      debtUsd: number
      healthFactor: number
      liquidationThreshold: number
    }
  | { type: 'thinking'; text: string }
  | {
      type: 'attempt'
      /** El escenario ya formateado por el vector: "ETH -25.0%", "USDC a $1.150". */
      label: string
      /** El valor crudo que se probó, en las unidades del vector. */
      intensity: number
      healthFactor: number
      verdict: 'SURVIVED' | 'LIQUIDATABLE'
      collateralUsd: number
    }
  | {
      type: 'conclusion'
      vectorLabel: string
      /** El umbral encontrado, o null si nada liquidó la posición. */
      threshold: number | null
      thresholdLabel: string | null
      /** Sólo para el vector de oráculo: lo que se lleva el atacante. */
      attackerProfitUsd?: number
      text: string
    }
  | { type: 'error'; message: string }

/**
 * Eventos de la auditoría completa: todos los vectores contra la misma posición,
 * cerrando con qué hacer al respecto.
 */
export type AuditEvent =
  | Extract<AttackEvent, { type: 'position' } | { type: 'error' }>
  | {
      type: 'auditStart'
      /**
       * Qué ataques se van a correr, anunciados antes de empezar.
       *
       * Sin esto la interfaz sólo puede mostrar los que ya arrancaron, y la
       * auditoría se lee como una lista que crece en vez de como una cola que
       * se va despachando. Cuáles aplican depende de la posición, así que no se
       * pueden dar por sabidos del lado del navegador.
       */
      vectors: { id: string; label: string }[]
    }
  | { type: 'vectorStart'; vectorId: string; label: string; premise: string }
  | {
      type: 'attempt'
      vectorId: string
      label: string
      intensity: number
      healthFactor: number
      verdict: 'SURVIVED' | 'LIQUIDATABLE'
      collateralUsd: number
      /**
       * Por qué el modelo eligió este escenario. Es la mitad del bucle que de
       * otro modo no se ve: sin esto la auditoría parece una lista de pruebas
       * predeterminadas en vez de una búsqueda.
       */
      rationale: string
    }
  | {
      type: 'vectorDone'
      vectorId: string
      label: string
      threshold: number | null
      thresholdLabel: string | null
      attackerProfitUsd?: number
      steps: number
      /**
       * Qué tan poco hace falta para romper la posición por acá: 0 es un mundo
       * tranquilo y 1 el escenario más extremo que este vector contempla. Es lo
       * que permite ordenar ataques que se miden en unidades distintas.
       */
      severity: number | null
      /**
       * Por qué la búsqueda se cortó, si se cortó.
       *
       * Sin esto, una simulación que falla por un problema de red llega a la
       * pantalla como "no encontró umbral", que se lee como que la posición
       * aguantó. Una mala noticia silenciada es peor que un error.
       */
      failure?: string
      /** Qué significa que este vector no haya llegado a liquidar la posición. */
      survivedMessage: string
    }
  /**
   * El ataque combinado: el modelo mezcla ataques que por separado no alcanzan.
   *
   * Va aparte de los demás porque no busca un umbral —no hay un solo número que
   * encontrar— sino una mezcla que funcione, y porque es el único lugar donde
   * el modelo hace algo que el código no podría hacer igual de bien.
   */
  | { type: 'combinedStart'; available: { id: string; label: string }[] }
  | {
      type: 'combinedTry'
      ingredients: { vectorId: string; shown: string }[]
      healthFactor: number
      liquidated: boolean
      rationale: string
    }
  | { type: 'combinedDone'; liquidated: boolean; failure?: string }
  | { type: 'recommendations'; recommendations: RecommendationView[] }

/** Recomendación tal como viaja al navegador (sin funciones). */
export interface RecommendationView {
  profileId: string
  profileLabel: string
  benchmark: string
  maxDebtUsd: number
  repayUsd: number
  alreadySafe: boolean
  resultingHealthFactor: number
  /**
   * Si ese health factor lo confirmó Aave montando la posición ajustada, o si
   * salió sólo de despejar la fórmula.
   *
   * La diferencia importa porque abajo del informe dice "verificado contra Aave
   * V3", y esa frase no puede acompañar a un número que Aave nunca vio.
   */
  verified: boolean
}
