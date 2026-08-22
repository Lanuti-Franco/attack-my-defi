'use client'

import type { ReactNode } from 'react'

export type WindowTone = 'normal' | 'dead'

/**
 * Una ventana del sistema: barra de título, botones de control y el marco
 * hundido donde vive el contenido.
 *
 * Los botones de control no hacen nada y están puestos igual. Son parte de lo
 * que hace reconocible a una ventana; sacarlos por ser decorativos deja algo
 * que ya no se lee como una ventana. Van marcados como decorativos para que
 * un lector de pantalla no los ofrezca como si fueran acciones.
 */
export function Window({
  title,
  icon,
  tone = 'normal',
  active = true,
  opening = false,
  shaking = false,
  className = '',
  children,
}: {
  title: string
  icon?: string
  tone?: WindowTone
  active?: boolean
  opening?: boolean
  shaking?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`raised flex flex-col p-1 ${opening ? 'window-open' : ''} ${shaking ? 'hit' : ''} ${className}`}
    >
      <header
        className="flex items-center gap-2 px-1 py-[3px]"
        style={{
          background: active
            ? 'linear-gradient(90deg, var(--title-from), var(--title-to))'
            : 'linear-gradient(90deg, var(--title-idle-from), var(--title-idle-to))',
        }}
      >
        {icon && (
          <span aria-hidden className="text-[13px] leading-none">
            {icon}
          </span>
        )}
        <h2 className="font-chrome truncate text-[11px] leading-none text-(--title-text)">
          {title}
        </h2>
        <div aria-hidden className="ml-auto flex gap-[2px]">
          <ControlButton label="_" />
          <ControlButton label="□" />
          <ControlButton label="✕" />
        </div>
      </header>

      <div
        className={tone === 'dead' ? 'flex-1 bg-(--bsod) p-4' : 'flex-1 p-3'}
        style={tone === 'dead' ? undefined : { background: 'var(--chrome)' }}
      >
        {children}
      </div>
    </section>
  )
}

function ControlButton({ label }: { label: string }) {
  return (
    <span className="raised font-chrome flex h-[15px] w-[16px] items-center justify-center pt-[1px] text-[8px] leading-none">
      {label}
    </span>
  )
}

/**
 * La barra de progreso segmentada del sistema.
 *
 * Cuando sabemos cuánto falta, avanza por bloques. Cuando no —el modelo está
 * pensando y todavía no probó nada—, los bloques desfilan sin llegar a ningún
 * lado, que es exactamente lo que el sistema hacía para decir "esperá".
 */
export function ProgressBar({ value }: { value: number | null }) {
  const seeking = value === null
  return (
    <div className="sunken h-[18px] bg-(--field) p-[2px]">
      <div
        className={`progress-blocks h-full ${seeking ? 'progress-seeking' : ''}`}
        style={{ width: seeking ? '100%' : `${Math.min(100, Math.max(0, value))}%` }}
        role="progressbar"
        aria-valuenow={seeking ? undefined : Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

/** Botón del sistema: relieve, y hundido mientras lo apretás. */
export function Button({
  onClick,
  disabled,
  children,
  className = '',
}: {
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`raised btn font-chrome px-4 py-2 text-[11px] disabled:text-(--chrome-shadow) ${className}`}
    >
      <span className="block">{children}</span>
    </button>
  )
}
