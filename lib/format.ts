/**
 * Cómo se muestran los números que salen de la cadena.
 *
 * Viven juntos porque estaban repetidos en cuatro componentes, y dos copias de
 * un formateador terminan divergiendo justo cuando alguien compara dos
 * pantallas y ve el mismo valor escrito distinto.
 */

/** Dólares, sin centavos: a esta escala los centavos son ruido. */
export const usd = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

/**
 * Health factor con cuatro decimales.
 *
 * Aave devuelve infinito cuando no hay deuda, y se muestra tal cual: una
 * posición sin deuda no es que aguante mucho, es que no puede liquidarse.
 */
export const hf = (n: number) => (n === Infinity ? '∞' : n.toFixed(4))
