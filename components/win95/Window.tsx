'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type WindowTone = 'normal' | 'dead'

/**
 * Una ventana del sistema: barra de título, botones de control y el marco
 * hundido donde vive el contenido.
 *
 * El botón de minimizar funciona: colapsa la ventana a su barra de título. Con
 * la auditoría entera desplegada la página se hace larga, y poder plegar lo que
 * ya se leyó es exactamente para lo que servía ese botón.
 *
 * Los otros dos no hacen nada y están puestos igual: son parte de lo que hace
 * reconocible a una ventana, y sacarlos por decorativos deja algo que ya no se
 * lee como una ventana. Van marcados como tales para que un lector de pantalla
 * no los ofrezca como acciones.
 */
export function Window({
  title,
  icon,
  tone = 'normal',
  opening = false,
  className = '',
  startCollapsed = false,
  collapseWhen = false,
  children,
}: {
  title: string
  icon?: string
  tone?: WindowTone
  opening?: boolean
  className?: string
  /** Para lo que es material de consulta y no hace falta tener abierto. */
  startCollapsed?: boolean
  /**
   * Se pliega sola cuando esto pasa a verdadero: al terminar la auditoría, el
   * detalle de cada ataque ya cumplió y lo que importa es el veredicto. Se
   * puede volver a abrir, así que no se pierde nada.
   */
  collapseWhen?: boolean
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(startCollapsed)

  // Sólo en el flanco: si se plegara en cada render, no habría forma de volver
  // a abrirla mientras la condición siga dándose.
  const wasAsked = useRef(collapseWhen)
  useEffect(() => {
    if (collapseWhen && !wasAsked.current) setCollapsed(true)
    wasAsked.current = collapseWhen
  }, [collapseWhen])

  return (
    <section
      className={`raised flex flex-col p-1 ${opening ? 'window-open' : ''} ${collapsed ? '' : className}`}
    >
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
        <div className="ml-auto flex gap-[2px]">
          <button
            type="button"
            onClick={() => setCollapsed((was) => !was)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            className="raised btn font-chrome flex h-[15px] w-[16px] items-center justify-center pt-[1px] text-[8px] leading-none"
          >
            <span className="block">{collapsed ? '□' : '_'}</span>
          </button>
          <span aria-hidden className="flex gap-[2px]">
            <ControlButton label="□" />
            <ControlButton label="✕" />
          </span>
        </div>
      </header>

      {!collapsed && (
        <div
          className={tone === 'dead' ? 'flex-1 bg-(--bsod) p-4' : 'flex-1 p-3'}
          style={tone === 'dead' ? undefined : { background: 'var(--chrome)' }}
        >
          {children}
        </div>
      )}
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
