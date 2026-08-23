/** Cómo se muestran los números que llegan de la cadena. */

/** Locale fijo: con el separador castellano, `$33.620` dentro de una frase en inglés se lee mal. */
export const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/** Aave devuelve infinito sin deuda: no es que aguante mucho, es que no puede liquidarse. */
export const hf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))
