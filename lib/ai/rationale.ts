/**
 * Saca los números del texto libre del modelo antes de mostrarlo.
 *
 * Si escribe "esto deja el health factor en 0,93" aparece en pantalla una cifra
 * que Aave nunca calculó — el único lugar del proyecto donde eso podría pasar.
 * Se reemplazan en vez de descartar la frase entera: el valor que propone ya se
 * muestra al lado, medido, así que lo que queda es su razonamiento.
 */
const DIGITS = /-?\d[\d.,]*/g

/** Las palabras cuentan igual: "zero point nine six" es un health factor inventado. */
const WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|third|quarter)\b(\s*[-\s]\s*(point|and))?/gi

export function withoutNumbers(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(DIGITS, '…')
    .replace(WORDS, '…')
    // "… … …" queda feo: uno alcanza.
    .replace(/(…[\s.,-]*)+…/g, '…')
}
