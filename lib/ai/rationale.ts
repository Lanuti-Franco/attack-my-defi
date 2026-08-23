/**
 * Lo que el modelo dice al elegir un escenario, sin los números que diga.
 *
 * El razonamiento se muestra porque es lo que deja ver que hay una búsqueda y
 * no una lista de pruebas fijas. Pero es texto libre generado por el modelo, y
 * si escribe "esto debería dejar el health factor en 0,93" aparece en pantalla
 * un número que no salió de Aave. Todo el proyecto está construido para que eso
 * no pueda pasar, y sería absurdo abrir la puerta justo en el único lugar donde
 * el modelo habla.
 *
 * Los números se reemplazan en vez de descartar el texto entero: el valor que
 * el modelo propone ya se muestra al lado, medido y verificado, así que lo que
 * queda —"el anterior aguantó, voy más fuerte"— es lo único que aportaba.
 */
const NUMBER = /-?\d[\d.,]*/g

export function withoutNumbers(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(NUMBER, '…')
}
