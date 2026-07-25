import type { Metadata } from 'next'
import { Poppins, Righteous } from 'next/font/google'
import './globals.css'

// next/font descarga y auto-hospeda las fuentes en tiempo de compilación: no hay
// petición a Google en tiempo de ejecución ni salto de maquetación al cargar.
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const righteous = Righteous({
  variable: '--font-righteous',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Memo — diario musical',
  description:
    'Registro de la música que escucho, con catálogo por géneros y reseñas de canciones y LPs.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${righteous.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
