/**
 * Cómo se llama el modelo, para mostrarlo.
 *
 * Vive separado de `localModel.ts` porque ese módulo importa el SDK de QVAC,
 * que es nativo y no puede cruzar al navegador. Acá sólo hay texto.
 *
 * Si cambia `MODEL_SRC`, esto tiene que cambiar con él.
 */
export const MODEL_LABEL = 'Qwen3 · 4B params · Q4_K_M'
