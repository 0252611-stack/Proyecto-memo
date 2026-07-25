import { Heart, PenLine } from 'lucide-react'
import Link from 'next/link'
import { SinDatos } from '@/components/Panel'
import { Estrellas } from '@/components/ui/Estrellas'
import { cn } from '@/lib/cn'
import { listRecentReviews, type ReviewFeedItem } from '@/lib/reviews'
import type { AlbumType } from '@/lib/schemas'

// El feed cambia cada vez que se escribe una reseña nueva, así que se calcula en cada
// visita en lugar de servirse desde caché.
export const dynamic = 'force-dynamic'

const TAMANO_PAGINA = 20

const ETIQUETA_TIPO_ALBUM: Record<AlbumType, string> = {
  LP: 'LP',
  EP: 'EP',
  SINGLE: 'Sencillo',
  COMPILATION: 'Recopilación',
}

/** Resuelve el título, artista y tipo mostrable de una reseña, sea de álbum o canción. */
function describirResena(r: ReviewFeedItem) {
  if (r.targetType === 'ALBUM') {
    return {
      titulo: r.album.title,
      artista: r.artist.name,
      tipo: ETIQUETA_TIPO_ALBUM[r.album.albumType as AlbumType] ?? r.album.albumType,
    }
  }
  return { titulo: r.track.title, artista: r.artist.name, tipo: 'Canción' }
}

function fechaLarga(fecha: Date) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    fecha,
  )
}

export default async function Resenas({ searchParams }: PageProps<'/resenas'>) {
  const sp = await searchParams
  const cursorCrudo = Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor
  const cursor = cursorCrudo && cursorCrudo.length > 0 ? cursorCrudo : undefined

  const resenas = await listRecentReviews({ limit: TAMANO_PAGINA, cursor })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Reseñas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todo lo que has escrito sobre álbumes y canciones.
          </p>
        </div>
        <Link
          href="/resenas/nueva"
          className="objetivo-tactil inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:opacity-90"
          style={{ transitionDuration: 'var(--duracion-rapida)' }}
        >
          <PenLine size={16} aria-hidden />
          Nueva reseña
        </Link>
      </div>

      {resenas.items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-surface">
          <SinDatos>Todavía no has escrito ninguna reseña.</SinDatos>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {resenas.items.map((r) => {
            const { titulo, artista, tipo } = describirResena(r)
            return (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-secondary-foreground uppercase">
                      {tipo}
                    </p>
                    <h2 className="mt-0.5 truncate font-display text-lg text-foreground">{titulo}</h2>
                    <p className="truncate text-sm text-muted-foreground">{artista}</p>
                  </div>
                  {r.isFavorite && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-star">
                      <Heart size={14} fill="currentColor" aria-hidden />
                      Favorita
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <Estrellas rating={r.rating} size={16} />
                </div>

                {r.title && <p className="mt-3 text-sm font-medium text-foreground">{r.title}</p>}

                {r.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{r.body}</p>
                )}

                {r.context && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="text-secondary-foreground">Contexto: </span>
                    {r.context}
                  </p>
                )}

                {r.listenedOn && (
                  <time
                    dateTime={r.listenedOn.toISOString()}
                    className="mt-3 block text-xs text-muted-foreground"
                  >
                    Escuchada el {fechaLarga(r.listenedOn)}
                  </time>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-6 flex justify-center">
        <CargarMas cursor={resenas.nextCursor} />
      </div>
    </div>
  )
}

function CargarMas({ cursor }: { cursor: string | null }) {
  const clases = cn(
    'objetivo-tactil inline-flex items-center rounded-lg border border-border-strong px-4 text-sm transition-colors',
    cursor ? 'text-foreground hover:bg-muted' : 'pointer-events-none text-muted-foreground opacity-50',
  )

  if (!cursor) {
    return (
      <span className={clases} aria-disabled="true">
        No hay más reseñas
      </span>
    )
  }

  return (
    <Link href={`/resenas?cursor=${encodeURIComponent(cursor)}`} className={clases}>
      Cargar más
    </Link>
  )
}
