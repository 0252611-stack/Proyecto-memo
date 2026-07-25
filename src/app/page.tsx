import { Disc3, PenLine } from 'lucide-react'
import Link from 'next/link'
import { BarraProporcion, Cifra, Panel, SinDatos } from '@/components/Panel'
import { Estrellas } from '@/components/ui/Estrellas'
import { listRecentListens } from '@/lib/listens'
import { listRecentReviews, type ReviewFeedItem } from '@/lib/reviews'
import { genreDistribution, getTotals, topArtists } from '@/lib/stats'

// Los datos cambian cada vez que registras una escucha o escribes una reseña, así que
// esta página se calcula en cada visita en lugar de servirse desde caché.
export const dynamic = 'force-dynamic'

function fechaCorta(fecha: Date) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(fecha)
}

/** Resuelve el título y el artista de una reseña, sea de álbum o de canción. */
function describirResena(r: ReviewFeedItem) {
  return r.targetType === 'ALBUM'
    ? { titulo: r.album.title, artista: r.artist.name, tipo: r.album.albumType }
    : { titulo: r.track.title, artista: r.artist.name, tipo: 'canción' }
}

export default async function Inicio() {
  const [totales, artistas, generos, resenas, escuchas] = await Promise.all([
    getTotals(),
    topArtists({}, 5),
    genreDistribution(),
    listRecentReviews({ limit: 4 }),
    listRecentListens({ pageSize: 6 }),
  ])

  const maxArtista = artistas[0]?.listenCount ?? 0
  const generosTop = generos.slice(0, 5)
  const maxGenero = generosTop[0]?.listenCount ?? 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="font-display text-3xl text-foreground">Tu diario musical</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Lo que has escuchado y lo que has escrito sobre ello.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra valor={totales.totalListens} etiqueta="escuchas" />
        {/* Cuenta artistas con al menos una escucha, no los del catálogo entero. */}
        <Cifra valor={totales.distinctArtists} etiqueta="artistas escuchados" />
        <Cifra valor={totales.totalReviews} etiqueta="reseñas" />
        <Cifra
          valor={totales.averageStars !== null ? `${totales.averageStars.toFixed(1)} ★` : '—'}
          etiqueta="calificación media"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Artistas más escuchados"
          accion={
            <Link
              href="/estadisticas"
              className="text-sm text-secondary-foreground hover:underline"
            >
              Ver todo
            </Link>
          }
        >
          {artistas.length === 0 ? (
            <SinDatos>Todavía no hay escuchas registradas.</SinDatos>
          ) : (
            <div className="space-y-3">
              {artistas.map((a) => (
                <BarraProporcion
                  key={a.artistId}
                  etiqueta={a.artistName}
                  valor={a.listenCount}
                  maximo={maxArtista}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Géneros que más escuchas">
          {generosTop.length === 0 ? (
            <SinDatos>Todavía no hay géneros registrados.</SinDatos>
          ) : (
            <div className="space-y-3">
              {generosTop.map((g) => (
                <BarraProporcion
                  key={g.genreId}
                  etiqueta={g.genreName}
                  valor={g.listenCount}
                  maximo={maxGenero}
                  color={g.genreColor}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          titulo="Últimas reseñas"
          accion={
            <Link href="/resenas" className="text-sm text-secondary-foreground hover:underline">
              Ver todas
            </Link>
          }
        >
          {resenas.items.length === 0 ? (
            <SinDatos>Todavía no has escrito ninguna reseña.</SinDatos>
          ) : (
            <ul className="space-y-3">
              {resenas.items.map((r) => {
                const { titulo, artista, tipo } = describirResena(r)
                return (
                  <li key={r.id} className="flex items-start gap-3">
                    <PenLine
                      size={16}
                      className="mt-1 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {titulo}
                        <span className="text-muted-foreground"> · {artista}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Estrellas rating={r.rating} size={13} />
                        <span className="text-xs text-muted-foreground">{tipo}</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          titulo="Escuchado recientemente"
          accion={
            <Link href="/escuchas" className="text-sm text-secondary-foreground hover:underline">
              Ver historial
            </Link>
          }
        >
          {escuchas.items.length === 0 ? (
            <SinDatos>Todavía no hay escuchas registradas.</SinDatos>
          ) : (
            <ul className="space-y-2.5">
              {escuchas.items.map((l) => (
                <li key={l.id} className="flex items-center gap-3">
                  <Disc3 size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {l.track.title}
                    <span className="text-muted-foreground"> · {l.track.artist.name}</span>
                  </span>
                  <time
                    dateTime={l.playedAt.toISOString()}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {fechaCorta(l.playedAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
