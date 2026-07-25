import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { ratingToStars } from '@/lib/schemas'

type Db = typeof prisma

/**
 * Rango de fechas opcional, acotado por la fecha de creación de la reseña.
 *
 * Existe para que el selector de rango de /estadisticas afecte también a estas
 * secciones: sin él, cambiar el rango dejaba las calificaciones medias inmóviles, lo
 * que se lee como si la página estuviera rota.
 */
export interface RatingDateRange {
  from?: Date
  to?: Date
}

function rangoDeReseñas(rango: RatingDateRange): Prisma.Sql[] {
  const condiciones: Prisma.Sql[] = []
  if (rango.from) condiciones.push(Prisma.sql`r.createdAt >= ${rango.from}`)
  if (rango.to) condiciones.push(Prisma.sql`r.createdAt <= ${rango.to}`)
  return condiciones
}

/** Une las condiciones en un WHERE, o devuelve nada si no hay ninguna. */
function armarWhere(condiciones: Prisma.Sql[]): Prisma.Sql {
  if (condiciones.length === 0) return Prisma.empty
  return Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}`
}

export interface ArtistRatingStat {
  artistId: string
  artistName: string
  reviewCount: number
  averageRating: number
  averageStars: number
}

// Fila cruda tal como la devuelve SQLite: COUNT(*) llega como BigInt con better-sqlite3,
// así que se convierte explícitamente a Number antes de exponerla.
interface ArtistRatingRow {
  artistId: string
  artistName: string
  reviewCount: bigint | number
  averageRating: number
}

/**
 * Calificación promedio por artista, calculada en la base de datos.
 *
 * Una reseña no guarda `artistId` directamente (apunta a un álbum o a una canción), así
 * que se resuelve el artista uniendo con `Album`/`Track`. Se usa SQL crudo porque
 * `groupBy` de Prisma no permite agrupar por un campo de una tabla relacionada.
 */
export async function averageRatingByArtist(
  artistId?: string,
  db: Db = prisma,
  rango: RatingDateRange = {},
): Promise<ArtistRatingStat[]> {
  const condiciones = rangoDeReseñas(rango)
  if (artistId) condiciones.push(Prisma.sql`ar.id = ${artistId}`)

  const rows = await db.$queryRaw<ArtistRatingRow[]>`
    SELECT
      ar.id AS artistId,
      ar.name AS artistName,
      COUNT(*) AS reviewCount,
      AVG(r.rating) AS averageRating
    FROM Review r
    LEFT JOIN Album al ON al.id = r.albumId
    LEFT JOIN Track t ON t.id = r.trackId
    JOIN Artist ar ON ar.id = COALESCE(al.artistId, t.artistId)
    ${armarWhere(condiciones)}
    GROUP BY ar.id, ar.name
    ORDER BY averageRating DESC, reviewCount DESC
  `
  return rows.map((row) => ({
    artistId: row.artistId,
    artistName: row.artistName,
    reviewCount: Number(row.reviewCount),
    averageRating: row.averageRating,
    averageStars: ratingToStars(row.averageRating),
  }))
}

export interface GenreRatingStat {
  genreId: string
  genreName: string
  reviewCount: number
  averageRating: number
  averageStars: number
}

interface GenreRatingRow {
  genreId: string
  genreName: string
  reviewCount: bigint | number
  averageRating: number
}

/**
 * Calificación promedio por género, calculada en la base de datos.
 *
 * Una reseña puede "pertenecer" a varios géneros a la vez (los del álbum o los de la
 * canción reseñada), así que contribuye una vez a cada uno de ellos.
 */
export async function averageRatingByGenre(
  genreId?: string,
  db: Db = prisma,
  rango: RatingDateRange = {},
): Promise<GenreRatingStat[]> {
  // El rango se aplica dentro de cada rama del UNION, donde `r` está en alcance; el
  // filtro por género se aplica después, sobre el resultado ya combinado.
  const porFecha = rangoDeReseñas(rango)
  const filtroAlbum = armarWhere([Prisma.sql`r.albumId IS NOT NULL`, ...porFecha])
  const filtroCancion = armarWhere([Prisma.sql`r.trackId IS NOT NULL`, ...porFecha])

  const rows = await db.$queryRaw<GenreRatingRow[]>`
    WITH review_genres AS (
      SELECT r.id AS reviewId, r.rating AS rating, ag.genreId AS genreId
      FROM Review r
      JOIN AlbumGenre ag ON ag.albumId = r.albumId
      ${filtroAlbum}
      UNION ALL
      SELECT r.id AS reviewId, r.rating AS rating, tg.genreId AS genreId
      FROM Review r
      JOIN TrackGenre tg ON tg.trackId = r.trackId
      ${filtroCancion}
    )
    SELECT
      g.id AS genreId,
      g.name AS genreName,
      COUNT(*) AS reviewCount,
      AVG(rg.rating) AS averageRating
    FROM review_genres rg
    JOIN Genre g ON g.id = rg.genreId
    ${genreId ? Prisma.sql`WHERE g.id = ${genreId}` : Prisma.empty}
    GROUP BY g.id, g.name
    ORDER BY averageRating DESC, reviewCount DESC
  `
  return rows.map((row) => ({
    genreId: row.genreId,
    genreName: row.genreName,
    reviewCount: Number(row.reviewCount),
    averageRating: row.averageRating,
    averageStars: ratingToStars(row.averageRating),
  }))
}
