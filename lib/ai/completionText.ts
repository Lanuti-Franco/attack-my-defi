/**
 * El texto que devolvió el modelo vive en `contentText`, no en `content`.
 *
 * Leer el campo equivocado no falla: devuelve vacío. Estuvo así en tres lugares
 * a la vez sin que se notara.
 */
export function completionText(final: unknown): string {
  return (final as { contentText?: string }).contentText?.trim() ?? ''
}
