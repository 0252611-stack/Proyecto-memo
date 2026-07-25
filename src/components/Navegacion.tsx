'use client'

import { BarChart3, Disc3, Home, Library, PenLine } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

// Máximo 5 destinos: por encima de eso la barra inferior deja de ser navegable con el
// pulgar y se vuelve una lista disfrazada.
const ENLACES = [
  { href: '/', etiqueta: 'Inicio', Icono: Home },
  { href: '/catalogo', etiqueta: 'Catálogo', Icono: Library },
  { href: '/escuchas', etiqueta: 'Escuchas', Icono: Disc3 },
  { href: '/resenas', etiqueta: 'Reseñas', Icono: PenLine },
  { href: '/estadisticas', etiqueta: 'Estadísticas', Icono: BarChart3 },
] as const

function estaActivo(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function Navegacion() {
  const pathname = usePathname()

  return (
    <>
      {/* Escritorio: barra superior */}
      <header className="hidden md:block sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-3"
        >
          <Link
            href="/"
            className="mr-6 font-display text-xl text-foreground transition-colors hover:text-accent"
            style={{ transitionDuration: 'var(--duracion-rapida)' }}
          >
            Memo
          </Link>
          {ENLACES.map(({ href, etiqueta, Icono }) => {
            const activo = estaActivo(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  activo
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                style={{ transitionDuration: 'var(--duracion-rapida)' }}
              >
                <Icono size={18} aria-hidden />
                {etiqueta}
              </Link>
            )
          })}
        </nav>
      </header>

      {/* Móvil: barra inferior, con margen para el área segura de los teléfonos con notch */}
      <nav
        aria-label="Principal"
        className="md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex">
          {ENLACES.map(({ href, etiqueta, Icono }) => {
            const activo = estaActivo(pathname, href)
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'objetivo-tactil flex flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors',
                    activo ? 'text-accent' : 'text-muted-foreground',
                  )}
                  style={{ transitionDuration: 'var(--duracion-rapida)' }}
                >
                  <Icono size={20} aria-hidden />
                  {etiqueta}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
