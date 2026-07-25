import Link from 'next/link'
import { BarraProporcion, Cifra, Panel, SinDatos } from '@/components/Panel'
import { averageRatingByArtist, averageRatingByGenre } from '@/lib/reviews'
import {
  genreDistribution,
  getTotals,
  monthlyActivity,
  topAlbums,
  topArtists,
  topTracks,
} from '@/lib/stats'
import { GraficoActividad } from './_components/GraficoActividad'
import { ListaCalificaciones } from './_components/ListaCalificaciones'
import { RANGOS, rangoAFechas, resolverRangoId } from './_lib/rango'

// Los datos dependen de las escuchas y reseñas registradas, y además cambian según el
// rango de fecha elegido en la URL: no hay nada que cachear entre visitas.
export const dynamic = 'force-dynamic'

const LIMITE_RANKING = 8

export default async function Estadisticas({ searchParams }: PageProps<'/estadisticas'>) {
  const params = await searchParams
  const rangoId = resolverRangoId(params.rango)
  const rango = rangoAFechas(rangoId)
  const etiquetaRango = RANGOS.find((r) => r.id === rangoId)?.etiqueta ?? ''

  const [totales, artistas, albumes, canciones, generos, actividad, calArtistas, calGeneros] =
    await Promise.all([
      getTotals(rango),
      topArtists(rango, LIMITE_RANKING),
      topAlbums(rango, LIMITE_RANKING),
      topTracks(rango, LIMITE_RANKING),
      genreDistribution(rango),
      monthlyActivity(rango),
      averageRatingByArtist(),
      averageRatingByGenre(),
    ])

  const maxArtista = artistas[0]?.listenCount ?? 0
  const maxAlbum = albumes[0]?.listenCount ?? 0
  const maxCancion = canciones[0]?.listenCount ?? 0
  const maxGenero = generos[0]?.listenCount ?? 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="font-display text-3xl text-foreground">Estadísticas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Análisis de tu diario musical · {etiquetaRango.toLowerCase()}
      </p>

      {/* Selector de rango: enlaces reales, no botones con onClick, para que funcione
          sin JavaScript y la URL resultante se pueda compartir o guardar. */}
      <nav aria-label="Rango de fechas" className="mt-4 flex flex-wrap gap-2">
        {RANGOS.map((r) => {
          const activo = r.id === rangoId
          return (
            <Link
              key={r.id}
              href={`/estadisticas?rango=${r.id}`}
              aria-current={activo ? 'true' : undefined}
              className={
                'objetivo-tactil flex items-center justify-center rounded-full border px-4 text-sm transition-colors ' +
                (activo
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground')
              }
              style={{ transitionDuration: 'var(--duracion-rapida)' }}
            >
              {r.etiqueta}
            </Link>
          )
        })}
      </nav>

      {/* Totales */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra valor={totales.totalListens} etiqueta="escuchas" />
        {/* Cuenta artistas con al menos una escucha en el rango, no los del catálogo entero. */}
        <Cifra valor={totales.distinctArtists} etiqueta="artistas escuchados" />
        <Cifra valor={totales.totalReviews} etiqueta="reseñas" />
        <Cifra
          valor={totales.averageStars !== null ? `${totales.averageStars.toFixed(1)} ★` : '—'}
          etiqueta="calificación media"
        />
      </div>

      {/* Rankings y distribución de géneros */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel titulo="Artistas más escuchados">
          {artistas.length === 0 ? (
            <SinDatos>Todavía no hay escuchas registradas en este rango.</SinDatos>
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

        <Panel titulo="Álbumes más escuchados">
          {albumes.length === 0 ? (
            <SinDatos>Todavía no hay escuchas registradas en este rango.</SinDatos>
          ) : (
            <div className="space-y-3">
              {albumes.map((al) => (
                <BarraProporcion
                  key={al.albumId}
                  etiqueta={`${al.albumTitle} · ${al.artistName}`}
                  valor={al.listenCount}
                  maximo={maxAlbum}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Canciones más escuchadas">
          {canciones.length === 0 ? (
            <SinDatos>Todavía no hay escuchas registradas en este rango.</SinDatos>
          ) : (
            <div className="space-y-3">
              {canciones.map((t) => (
                <BarraProporcion
                  key={t.trackId}
                  etiqueta={`${t.trackTitle} · ${t.artistName}`}
                  valor={t.listenCount}
                  maximo={maxCancion}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Géneros escuchados">
          {generos.length === 0 ? (
            <SinDatos>Todavía no hay géneros registrados en este rango.</SinDatos>
          ) : (
            <div className="space-y-3">
              {generos.map((g) => (
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
      </div>

      {/* Actividad mensual */}
      <div className="mt-4">
        <Panel titulo="Actividad mensual">
          <GraficoActividad datos={actividad} />
        </Panel>
      </div>

      {/* Calificaciones medias: no dependen del rango de fecha elegido, porque
          averageRatingByArtist/averageRatingByGenre resumen todas las reseñas
          históricas, no sólo las de un periodo. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel titulo="Calificación media por artista">
          <ListaCalificaciones
            items={calArtistas.map((c) => ({
              id: c.artistId,
              nombre: c.artistName,
              averageRating: c.averageRating,
              averageStars: c.averageStars,
              reviewCount: c.reviewCount,
            }))}
            vacio="Todavía no has escrito ninguna reseña."
          />
        </Panel>

        <Panel titulo="Calificación media por género">
          <ListaCalificaciones
            items={calGeneros.map((c) => ({
              id: c.genreId,
              nombre: c.genreName,
              averageRating: c.averageRating,
              averageStars: c.averageStars,
              reviewCount: c.reviewCount,
            }))}
            vacio="Todavía no has escrito ninguna reseña."
          />
        </Panel>
      </div>
    </div>
  )
}
