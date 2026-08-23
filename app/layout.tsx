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
    'Attacks your Aave V3 position on a fork of Ethereum mainnet until it finds what liquidates it. The model never makes up a number.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${silkscreen.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
