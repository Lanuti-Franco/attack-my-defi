'use client'

/**
 * Los sonidos del sistema, sintetizados en el navegador.
 *
 * Ni un archivo de audio: cada sonido son un par de osciladores cuadrados, que
 * es literalmente cómo sonaba una PC de la época. Además de pesar cero, evita
 * el problema obvio de agarrar los samples de un juego que no es nuestro.
 *
 * El navegador no deja sonar nada hasta que la persona interactúa con la
 * página, y eso acá juega a favor: el primer sonido es el click en Atacame.
 */
export type Cue = 'click' | 'open' | 'hit' | 'defeat' | 'survive' | 'done'

interface Note {
  freq: number
  /** Segundos desde que arranca el sonido. */
  at: number
  duration: number
  /** Cuadrada suena a PC vieja; triangular es más suave, para los chimes. */
  wave?: OscillatorType
  gain?: number
  /** Frecuencia final, si el tono se desliza. */
  slideTo?: number
}

const CUES: Record<Cue, Note[]> = {
  // El clack seco de un botón físico.
  click: [{ freq: 900, at: 0, duration: 0.03, gain: 0.16 }],

  // Dos tonos que suben: algo apareció.
  open: [
    { freq: 660, at: 0, duration: 0.05, gain: 0.12 },
    { freq: 990, at: 0.05, duration: 0.06, gain: 0.12 },
  ],

  // El impacto del asedio: grave y cayendo.
  hit: [{ freq: 160, at: 0, duration: 0.16, slideTo: 55, gain: 0.22 }],

  // La posición cayó. Tres golpes graves, el último se desploma.
  defeat: [
    { freq: 220, at: 0, duration: 0.12, gain: 0.2 },
    { freq: 165, at: 0.14, duration: 0.12, gain: 0.2 },
    { freq: 110, at: 0.28, duration: 0.5, slideTo: 40, gain: 0.24 },
  ],

  // Aguantó: dos notas cortas y limpias.
  survive: [
    { freq: 880, at: 0, duration: 0.06, wave: 'triangle', gain: 0.14 },
    { freq: 1320, at: 0.07, duration: 0.1, wave: 'triangle', gain: 0.14 },
  ],

  // El informe está listo.
  done: [
    { freq: 660, at: 0, duration: 0.08, wave: 'triangle', gain: 0.14 },
    { freq: 880, at: 0.09, duration: 0.08, wave: 'triangle', gain: 0.14 },
    { freq: 1320, at: 0.18, duration: 0.22, wave: 'triangle', gain: 0.14 },
  ],
}

const MUTE_KEY = 'attack-my-defi.muted'

let context: AudioContext | null = null
let muted = false

/** Lee la preferencia guardada. El almacenamiento puede fallar y no importa. */
export function loadMutePreference(): boolean {
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    muted = false
  }
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    // Sin almacenamiento la preferencia dura lo que dure la pestaña.
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!context) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
  }
  // Los navegadores dejan el contexto suspendido hasta el primer gesto.
  if (context.state === 'suspended') void context.resume()
  return context
}

/**
 * Toca un sonido del sistema. Nunca tira: que falle el audio no puede voltear
 * una auditoría.
 */
export function play(cue: Cue): void {
  if (muted) return
  try {
    const ctx = audioContext()
    if (!ctx) return
    const now = ctx.currentTime

    for (const note of CUES[cue]) {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      osc.type = note.wave ?? 'square'

      const start = now + note.at
      const end = start + note.duration
      osc.frequency.setValueAtTime(note.freq, start)
      if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, end)

      // Una caída exponencial hasta casi cero: cortar de golpe hace un clic feo.
      amp.gain.setValueAtTime(note.gain ?? 0.15, start)
      amp.gain.exponentialRampToValueAtTime(0.0001, end)

      osc.connect(amp).connect(ctx.destination)
      osc.start(start)
      osc.stop(end)
    }
  } catch {
    // Sin audio se sigue igual.
  }
}
