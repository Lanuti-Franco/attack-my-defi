/**
 * El texto que devolvió el modelo.
 *
 * Vive en `contentText`, no en `content`. La diferencia costó cara: los tres
 * lugares que leen texto del modelo estaban mirando el campo equivocado, así
 * que el razonamiento que se muestra en el bucle llegaba siempre vacío y la
 * frase de cierre caía siempre al respaldo. Nada fallaba de forma visible,
 * simplemente no aparecía nada — que es el peor tipo de error.
 */
export function completionText(final: unknown): string {
  return (final as { contentText?: string }).contentText?.trim() ?? ''
}
