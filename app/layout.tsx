import type { Metadata } from 'next'
import { Silkscreen, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/** Bitmap, para el chrome del sistema: títulos de ventana, botones, etiquetas. */
const silkscreen = Silkscreen({
  variable: '--font-silkscreen',
  weight: ['400', '700'],
  subsets: ['latin'],
})

/** Para todo lo que sea dato: tiene cifras tabulares y aguanta la cámara. */
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Attack My DeFi',
  description:
    'Seis ataques contra tu posición en Aave V3, simulados sobre un fork de Ethereum mainnet. Ningún número lo inventa el modelo.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${silkscreen.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
