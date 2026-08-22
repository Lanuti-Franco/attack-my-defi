import { loadModel, unloadModel, QWEN3_4B_INST_Q4_K_M } from '@qvac/sdk'

/**
 * Modelo local. Toda la inferencia corre en la máquina del usuario: no hay API
 * keys ni llamadas a un modelo en la nube.
 */
/** Si cambia esto, actualizá `MODEL_LABEL` en `modelName.ts`, que es lo que se muestra. */
export const MODEL_SRC = QWEN3_4B_INST_Q4_K_M
export const MODEL_NAME = 'Qwen3 4B (Q4_K_M)'

/**
 * Parámetros de generación, elegidos con mediciones y no por intuición:
 *
 * - `reasoning_budget: 0` — Qwen3 razona por defecto y quemaba ~278 segundos de
 *   deliberación antes de una sola llamada a la herramienta. Acá el modelo no
 *   necesita deliberar: elige un número por paso y el bucle vive en el código.
 *   Bajarlo a cero llevó cada paso de 278s a ~1,5s.
 * - `remove_thinking_from_context` — evita que los restos de razonamiento
 *   inflen el contexto entre pasos.
 * - `seed` fijo — dos corridas del mismo ataque producen la misma secuencia,
 *   así se pueden mezclar tomas distintas de la grabación.
 */
export const GENERATION_PARAMS = {
  reasoning_budget: 0,
  remove_thinking_from_context: true,
  predict: 256,
  temp: 0.3,
  seed: 42,
} as const

let cached: string | null = null

/**
 * Carga el modelo una vez y lo deja en memoria.
 *
 * `tools: true` es obligatorio: sin esa opción el SDK no inyecta las
 * definiciones de herramientas en el prompt y el modelo responde como si no
 * existieran, sin emitir ningún error.
 */
export async function ensureModel(
  onProgress?: (pct: number, stage: string) => void,
): Promise<string> {
  if (cached) return cached
  cached = await loadModel({
    modelSrc: MODEL_SRC,
    modelConfig: { ctx_size: 8192, tools: true },
    onProgress: (p: unknown) => {
      const prog = p as { percentage?: number; percent?: number; progress?: number; stage?: string }
      const pct = Math.round(prog.percentage ?? (prog.percent ?? prog.progress ?? 0) * 100)
      onProgress?.(pct, prog.stage ?? 'descargando')
    },
  })
  return cached
}

export async function releaseModel(): Promise<void> {
  if (!cached) return
  await unloadModel({ modelId: cached })
  cached = null
}
