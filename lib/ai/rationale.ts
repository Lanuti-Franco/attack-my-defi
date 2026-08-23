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
const DIGITS = /-?\d[\d.,]*/g

/**
 * Los números escritos en palabras cuentan igual.
 *
 * Filtrar sólo dígitos deja pasar "should leave it around zero point nine six",
 * que es un health factor inventado con todas las letras. El modelo responde en
 * inglés, así que alcanza con la lista inglesa.
 */
const WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|third|quarter)\b(\s*[-\s]\s*(point|and))?/gi

export function withoutNumbers(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(DIGITS, '…')
    .replace(WORDS, '…')
    // Varios reemplazos seguidos quedan como "… … …": uno alcanza.
    .replace(/(…[\s.,-]*)+…/g, '…')
}
