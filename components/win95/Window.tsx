'use client'

import type { ReactNode } from 'react'

type WindowTone = 'normal' | 'dead'

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
  opening = false,
  className = '',
  children,
}: {
  title: string
  icon?: string
  tone?: WindowTone
  opening?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`raised flex flex-col p-1 ${opening ? 'window-open' : ''} ${className}`}>
      <header
        className="flex items-center gap-2 px-1 py-[3px]"
        style={{ background: 'linear-gradient(90deg, var(--title-from), var(--title-to))' }}
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
 * La barra de progreso del sistema, en su versión indeterminada: los bloques
 * desfilan sin llegar a ningún lado.
 *
 * Es la única honesta acá. No sabemos cuántos sondeos va a necesitar el modelo
 * hasta que termina, así que una barra que avanzara hasta un total sería una
 * invención — y este proyecto se trata justamente de no inventar números.
 */
export function ProgressBar() {
  return (
    <div className="sunken h-[18px] bg-(--field) p-[2px]" role="progressbar" aria-busy>
      <div className="progress-blocks progress-seeking h-full w-full" />
    </div>
  )
}

/** Botón del sistema: relieve, y hundido mientras lo apretás. */
export function Button({
  onClick,
  disabled,
  children,
  className = 'px-4 py-2 text-[11px]',
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
      className={`raised btn font-chrome disabled:text-(--chrome-shadow) ${className}`}
    >
      <span className="block">{children}</span>
    </button>
  )
}
