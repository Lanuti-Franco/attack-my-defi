import { Desktop } from '@/components/Desktop'

/**
 * El bloque del fork se lee en el servidor y baja como dato: es lo que la barra
 * de tareas muestra en lugar del reloj, y lo que hace que dos corridas
 * cualesquiera —dos tomas del video, sin ir más lejos— partan del mismo estado.
 */
export default function Home() {
  return <Desktop forkBlock={process.env.PINNED_BLOCK ?? '—'} />
}
