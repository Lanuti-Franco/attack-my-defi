import { Desktop } from '@/components/Desktop'

/** El bloque se lee en el servidor: la barra de tareas lo muestra en lugar del reloj. */
export default function Home() {
  return <Desktop forkBlock={process.env.PINNED_BLOCK ?? '—'} />
}
