'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type WindowTone = 'normal' | 'dead'

/**
 * Una ventana del sistema, con los controles funcionando: minimizar pliega a la
 * barra de título, cerrar la saca de la pantalla, y la barra misma pliega y
 * despliega al hacerle click, como hacía el original.
 *
 * Maximizar queda decorativo: acá las ventanas ya ocupan el ancho que les toca.
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
  const [closed, setClosed] = useState(false)

  // Sólo en el flanco: si se plegara en cada render, no habría forma de volver
  // a abrirla mientras la condición siga dándose.
  const wasAsked = useRef(collapseWhen)
  useEffect(() => {
    if (collapseWhen && !wasAsked.current) setCollapsed(true)
    wasAsked.current = collapseWhen
  }, [collapseWhen])

  if (closed) return null

  return (
    <section
      className={`raised flex flex-col p-1 ${opening ? 'window-open' : ''} ${collapsed ? '' : className}`}
    >
      {/* La barra entera pliega y despliega: es el gesto que uno espera de una
          ventana, y deja el botón para quien lo busca. */}
      <header
        onClick={() => setCollapsed((was) => !was)}
        className="flex cursor-pointer items-center gap-2 px-1 py-[3px]"
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
        <div className="ml-auto flex gap-[2px]" onClick={(e) => e.stopPropagation()}>
          <ControlButton
            label={collapsed ? '□' : '_'}
            title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            onClick={() => setCollapsed((was) => !was)}
          />
          <span aria-hidden>
            <ControlButton label="□" />
          </span>
          <ControlButton label="✕" title={`Close ${title}`} onClick={() => setClosed(true)} />
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

/** Sin `onClick` queda como adorno, sin foco ni anuncio para lectores de pantalla. */
function ControlButton({
  label,
  title,
  onClick,
}: {
  label: string
  title?: string
  onClick?: () => void
}) {
  const chrome =
    'raised font-chrome flex h-[15px] w-[16px] items-center justify-center pt-[1px] text-[8px] leading-none'

  if (!onClick) return <span className={chrome}>{label}</span>

  return (
    <button type="button" onClick={onClick} aria-label={title} title={title} className={`btn ${chrome}`}>
      <span className="block">{label}</span>
    </button>
  )
}

/**
 * Indeterminada a propósito: no sabemos cuántos sondeos va a necesitar el
 * modelo, y una barra que avanzara hasta un total sería un número inventado.
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
