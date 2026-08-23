'use client'

/**
 * Los sonidos del asedio, sintetizados: ni un archivo de audio, ni un sample de
 * un juego que no es nuestro.
 *
 * Lo que suena a impacto y no a beep es el ruido filtrado. Un tono puro suena a
 * PC vieja; un golpe es un estallido de ruido que se apaga rápido con cuerpo
 * grave abajo.
 */
type Cue = 'click' | 'open' | 'hit' | 'defeat' | 'survive' | 'done'

const MUTE_KEY = 'attack-my-defi.muted'

let context: AudioContext | null = null
let muted = false
/** El ruido se genera una vez y se reusa: llenarlo por golpe es tirar CPU. */
let noise: AudioBuffer | null = null

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
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noise) {
    const frames = ctx.sampleRate * 2
    noise = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  }
  return noise
}

/**
 * El estallido de un impacto: ruido pasado por un filtro que se cierra.
 *
 * El filtro bajando de agudo a grave es lo que da la sensación de algo pesado
 * golpeando algo pesado, en vez de un siseo.
 */
function thud(
  ctx: AudioContext,
  at: number,
  opts: { duration: number; from: number; to: number; gain: number },
): void {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(opts.from, at)
  filter.frequency.exponentialRampToValueAtTime(opts.to, at + opts.duration)

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(opts.gain, at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration)

  source.connect(filter).connect(amp).connect(ctx.destination)
  source.start(at)
  source.stop(at + opts.duration)
}

/** El cuerpo grave que va debajo del estallido, o un tono suelto. */
function tone(
  ctx: AudioContext,
  at: number,
  opts: { freq: number; duration: number; gain: number; slideTo?: number; wave?: OscillatorType },
): void {
  const osc = ctx.createOscillator()
  osc.type = opts.wave ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, at)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, at + opts.duration)

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(opts.gain, at)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration)

  osc.connect(amp).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + opts.duration)
}

function render(ctx: AudioContext, cue: Cue, now: number): void {
  switch (cue) {
    // Madera seca.
    case 'click':
      thud(ctx, now, { duration: 0.05, from: 3000, to: 700, gain: 0.25 })
      tone(ctx, now, { freq: 180, duration: 0.05, gain: 0.12 })
      return

    case 'open':
      tone(ctx, now, { freq: 330, duration: 0.07, gain: 0.1, wave: 'triangle' })
      tone(ctx, now + 0.07, { freq: 495, duration: 0.09, gain: 0.1, wave: 'triangle' })
      return

    // El ariete contra la puerta.
    case 'hit':
      thud(ctx, now, { duration: 0.22, from: 1800, to: 120, gain: 0.5 })
      tone(ctx, now, { freq: 90, duration: 0.28, slideTo: 45, gain: 0.35 })
      return

    // Tres golpes y el derrumbe.
    case 'defeat':
      thud(ctx, now, { duration: 0.18, from: 1600, to: 100, gain: 0.45 })
      tone(ctx, now, { freq: 80, duration: 0.2, slideTo: 50, gain: 0.3 })
      thud(ctx, now + 0.2, { duration: 0.18, from: 1400, to: 90, gain: 0.45 })
      tone(ctx, now + 0.2, { freq: 70, duration: 0.2, slideTo: 42, gain: 0.3 })
      thud(ctx, now + 0.42, { duration: 0.9, from: 1200, to: 60, gain: 0.55 })
      tone(ctx, now + 0.42, { freq: 60, duration: 0.9, slideTo: 28, gain: 0.4 })
      return

    // El golpe rebota contra el muro.
    case 'survive':
      thud(ctx, now, { duration: 0.09, from: 5000, to: 2200, gain: 0.22 })
      tone(ctx, now, { freq: 740, duration: 0.1, gain: 0.1, wave: 'triangle' })
      tone(ctx, now + 0.05, { freq: 1110, duration: 0.12, gain: 0.08, wave: 'triangle' })
      return

    case 'done':
      tone(ctx, now, { freq: 392, duration: 0.11, gain: 0.11, wave: 'triangle' })
      tone(ctx, now + 0.12, { freq: 523, duration: 0.11, gain: 0.11, wave: 'triangle' })
      tone(ctx, now + 0.24, { freq: 784, duration: 0.3, gain: 0.12, wave: 'triangle' })
      return
  }
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
    render(ctx, cue, ctx.currentTime)
  } catch {
    // Sin audio se sigue igual.
  }
}
