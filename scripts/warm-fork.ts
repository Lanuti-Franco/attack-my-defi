/**
 * Deja el fork listo para trabajar. Se corre una vez, después de levantar Anvil.
 *
 * Hace las dos cosas caras de una sola vez, para que ninguna corrida las pague:
 * trae el mundo desde el RPC y anota el snapshot limpio al que van a volver
 * todas las corridas siguientes, y cotiza la venta más grande que el vector de
 * cascada puede llegar a probar. Esa cotización cruza todos los ticks de
 * Uniswap que cruzan las ventas menores, así que después cualquier valor
 * intermedio sale del caché en milisegundos en vez de minutos.
 *
 * Anvil guarda ese caché en disco, pero sólo si lo cerrás con SIGTERM. Un
 * kill -9 lo pierde y hay que volver a pagar todo.
 */
import { resetFork } from '../lib/chain/reset'
import { measureMarketImpact } from '../lib/simulation/marketImpact'
import { assertForkAlive } from '../lib/chain/client'

/**
 * Se calienta por escalones y no de una.
 *
 * Cotizar 25.000 WETH con el caché vacío tarda más que el timeout de viem y se
 * cae. Cada venta más chica deja listos los ticks que la siguiente va a cruzar,
 * así que subir de a poco llega al mismo lugar sin que ningún pedido tarde
 * demasiado. El último escalón es el techo del vector de cascada: llegar ahí
 * deja caliente todo el rango que el modelo puede llegar a probar.
 */
const STAIRCASE = [500, 2_000, 5_000, 10_000, 16_000, 21_000, 25_000]

async function step<T>(label: string, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  process.stdout.write(`${label}… `)
  const result = await work()
  console.log(`${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
  return result
}

async function main() {
  const block = await assertForkAlive()
  console.log(`fork vivo en el bloque ${block}\n`)

  await step('mundo limpio anotado', resetFork)

  let impact = null
  for (const amount of STAIRCASE) {
    impact = await step(
      `pools cacheados hasta ${amount.toLocaleString('es-AR')} WETH`,
      () => measureMarketImpact('WETH', amount),
    )
  }

  const largest = STAIRCASE[STAIRCASE.length - 1]
  console.log(
    `\nlisto. Vender ${largest.toLocaleString('es-AR')} WETH mueve el precio ${((impact?.slippage ?? 0) * 100).toFixed(2)}%.`,
  )
  console.log('Cerrá Anvil con SIGTERM (Ctrl+C) para que el caché quede en disco.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
