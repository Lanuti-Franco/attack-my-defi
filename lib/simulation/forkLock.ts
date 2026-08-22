import { readFileSync, writeFileSync, rmSync } from 'node:fs'

/**
 * Un solo fork, un solo dueño a la vez.
 *
 * El servidor de Next y cada script hablan con el mismo Anvil, y una auditoría
 * no es una lectura: monta una posición, la rompe y revierte. Dos a la vez se
 * pisan de la peor manera —una resetea el mundo mientras la otra está a mitad
 * de montar— y el síntoma es un revert incomprensible en un lugar que no tiene
 * nada que ver.
 *
 * Fallar de entrada con un mensaje claro es infinitamente mejor que eso.
 */
const LOCK_FILE = '.anvil-lock'

/** Después de esto se asume que quien lo tomó murió sin soltarlo. */
const STALE_AFTER_MS = 15 * 60 * 1000

interface Holder {
  pid: number
  since: number
  what: string
}

function readHolder(): Holder | null {
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as Holder
  } catch {
    return null
  }
}

/** ¿El proceso que lo tomó sigue vivo? */
function alive(pid: number): boolean {
  try {
    // La señal 0 no hace nada: sólo sirve para preguntar si el proceso existe.
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM significa que existe pero es de otro usuario, así que está vivo.
    // Sólo ESRCH quiere decir que no hay nadie ahí.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function acquireForkLock(what: string): void {
  const holder = readHolder()

  if (holder && holder.pid !== process.pid) {
    const age = Date.now() - holder.since
    if (alive(holder.pid) && age < STALE_AFTER_MS) {
      throw new Error(
        `El fork ya lo está usando otra cosa: ${holder.what} (proceso ${holder.pid}, ` +
          `hace ${Math.round(age / 1000)}s). Esperá a que termine o cortalo.`,
      )
    }
  }

  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, since: Date.now(), what }), 'utf8')
}

export function releaseForkLock(): void {
  const holder = readHolder()
  // Sólo suelta el suyo: si otro ya lo tomó, borrarlo sería peor que no hacer nada.
  if (holder?.pid !== process.pid) return
  try {
    rmSync(LOCK_FILE)
  } catch {
    // Ya no estaba.
  }
}
