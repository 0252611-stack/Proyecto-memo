import { ChevronLeft, ChevronRight, Disc3 } from 'lucide-react'
import Link from 'next/link'
import { SinDatos } from '@/components/Panel'
import { cn } from '@/lib/cn'
import { listRecentListens } from '@/lib/listens'
import type { ListenSource } from '@/lib/schemas'

// El historial cambia con cada escucha nueva (manual, importada o sincronizada), así
// que se calcula en cada visita en lugar de servirse desde caché.
export const dynamic = 'force-dynamic'

const TAMANO_PAGINA = 20

const ETIQUETA_ORIGEN: Record<ListenSource, string> = {
  MANUAL: 'Manual',
  SPOTIFY: 'Spotify',
  IMPORT: 'Importada',
}

function fechaHora(fecha: Date) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(fecha)
}

/** Lee `page` de los search params y lo normaliza a un entero >= 1. */
function paginaDeSearchParams(valor: string | string[] | undefined): number {
  const crudo = Array.isArray(valor) ? valor[0] : valor
  const numero = Number.parseInt(crudo ?? '1', 10)
  return Number.isFinite(numero) && numero >= 1 ? numero : 1
}

export default async function Escuchas({ searchParams }: PageProps<'/escuchas'>) {
  const sp = await searchParams
  const paginaSolicitada = paginaDeSearchParams(sp.page)

  const escuchas = await listRecentListens({ page: paginaSolicitada, pageSize: TAMANO_PAGINA })
  // Si piden una página fuera de rango (por ejemplo tras borrar datos), mostramos la
  // última página válida en vez de una lista vacía confusa.
  const pagina = Math.min(paginaSolicitada, Math.max(1, escuchas.totalPages))

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="font-display text-3xl text-foreground">Historial de escuchas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {escuchas.total} escucha{escuchas.total === 1 ? '' : 's'} registrada
        {escuchas.total === 1 ? '' : 's'} en total.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {escuchas.items.length === 0 ? (
          <SinDatos>Todavía no hay escuchas registradas.</SinDatos>
        ) : (
          <ul className="divide-y divide-border">
            {escuchas.items.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                <Disc3 size={18} className="shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {l.track.title}
                    <span className="text-muted-foreground"> · {l.track.artist.name}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.track.album ? l.track.album.title : 'Sin álbum'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <time dateTime={l.playedAt.toISOString()} className="text-xs text-foreground tabular-nums">
                    {fechaHora(l.playedAt)}
                  </time>
                  <span className="text-xs text-muted-foreground">
                    {ETIQUETA_ORIGEN[l.source as ListenSource] ?? l.source}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {escuchas.totalPages > 1 && (
        <nav
          aria-label="Paginación del historial de escuchas"
          className="mt-4 flex items-center justify-between gap-3"
        >
          <ControlPagina
            pagina={pagina - 1}
            disponible={pagina > 1}
            direccion="anterior"
          />
          <span className="text-sm text-muted-foreground tabular-nums">
            Página {pagina} de {escuchas.totalPages}
          </span>
          <ControlPagina
            pagina={pagina + 1}
            disponible={pagina < escuchas.totalPages}
            direccion="siguiente"
          />
        </nav>
      )}
    </div>
  )
}

function ControlPagina({
  pagina,
  disponible,
  direccion,
}: {
  pagina: number
  disponible: boolean
  direccion: 'anterior' | 'siguiente'
}) {
  const esAnterior = direccion === 'anterior'
  const etiqueta = esAnterior ? 'Página anterior' : 'Página siguiente'
  const contenido = (
    <>
      {esAnterior && <ChevronLeft size={18} aria-hidden />}
      {esAnterior ? 'Anterior' : 'Siguiente'}
      {!esAnterior && <ChevronRight size={18} aria-hidden />}
    </>
  )
  const clases = cn(
    'objetivo-tactil inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 text-sm transition-colors',
    disponible
      ? 'text-foreground hover:bg-muted'
      : 'pointer-events-none text-muted-foreground opacity-50',
  )

  if (!disponible) {
    return (
      <span className={clases} aria-disabled="true">
        {contenido}
      </span>
    )
  }

  return (
    <Link href={`/escuchas?page=${pagina}`} className={clases} aria-label={etiqueta}>
      {contenido}
    </Link>
  )
}
