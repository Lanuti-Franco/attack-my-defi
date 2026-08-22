/**
 * Saca las credenciales de cualquier texto que pueda terminar en pantalla.
 *
 * Los errores de viem citan el request entero, y el request de anvil_reset
 * lleva la URL del RPC con la API key adentro. Ese texto viaja al navegador
 * como mensaje de error y se ve en la pantalla — en una demo grabada, la key
 * queda en el video.
 *
 * De cada URL sobrevive el host, que es lo único que sirve para entender qué
 * falló: el path y la query son donde viven las credenciales.
 */
export function redactSecrets(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
    try {
      return `${new URL(url).origin}/…`
    } catch {
      return '[url]'
    }
  })
}

/** El mensaje de un error, ya sin credenciales, listo para mostrar. */
export function safeMessage(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err))
}
