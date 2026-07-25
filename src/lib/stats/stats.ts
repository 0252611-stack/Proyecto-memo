import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { ratingToStars } from '@/lib/schemas'

type Db = typeof prisma

/** Rango de fechas opcional para acotar cualquier estadística. Ambos extremos incluidos. */
export interface DateRange {
  from?: Date
  to?: Date
}

/** Construye un `WHERE columna >= from AND columna <= to`, o nada si el rango está vacío. */
function dateRangeWhere(column: string, range: DateRange): Prisma.Sql {
  const conditions: Prisma.Sql[] = []
  if (range.from) conditions.push(Prisma.sql`${Prisma.raw(column)} >= ${range.from}`)
  if (range.to) conditions.push(Prisma.sql`${Prisma.raw(column)} <= ${range.to}`)
  if (conditions.length === 0) return Prisma.empty
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
}

// --- Top artistas / álbumes / canciones ---------------------------------------------
// Todas calculadas con una sola consulta agregada en SQLite (GROUP BY + COUNT), nunca
// trayendo las escuchas a memoria para contarlas en JavaScript.

export interface TopArtistStat {
  artistId: string
  artistName: string
  listenCount: number
}

interface TopArtistRow {
  artistId: string
  artistName: string
  listenCount: bigint | number
}

export async function topArtists(range: DateRange = {}, limit = 10, db: Db = prisma): Promise<TopArtistStat[]> {
  const rows = await db.$queryRaw<TopArtistRow[]>`
    SELECT ar.id AS artistId, ar.name AS artistName, COUNT(*) AS listenCount
    FROM Listen l
    JOIN Track t ON t.id = l.trackId
    JOIN Artist ar ON ar.id = t.artistId
    ${dateRangeWhere('l.playedAt', range)}
    GROUP BY ar.id, ar.name
    ORDER BY listenCount DESC
    LIMIT ${limit}
  `
  return rows.map((row) => ({
    artistId: row.artistId,
    artistName: row.artistName,
    listenCount: Number(row.listenCount),
  }))
}

export interface TopAlbumStat {
  albumId: string
  albumTitle: string
  artistId: string
  artistName: string
  listenCount: number
}

interface TopAlbumRow {
  albumId: string
  albumTitle: string
  artistId: string
  artistName: string
  listenCount: bigint | number
}

export async function topAlbums(range: DateRange = {}, limit = 10, db: Db = prisma): Promise<TopAlbumStat[]> {
  const rows = await db.$queryRaw<TopAlbumRow[]>`
    SELECT al.id AS albumId, al.title AS albumTitle, ar.id AS artistId, ar.name AS artistName, COUNT(*) AS listenCount
    FROM Listen l
    JOIN Track t ON t.id = l.trackId
    JOIN Album al ON al.id = t.albumId
    JOIN Artist ar ON ar.id = al.artistId
    ${dateRangeWhere('l.playedAt', range)}
    GROUP BY al.id, al.title, ar.id, ar.name
    ORDER BY listenCount DESC
    LIMIT ${limit}
  `
  return rows.map((row) => ({
    albumId: row.albumId,
    albumTitle: row.albumTitle,
    artistId: row.artistId,
    artistName: row.artistName,
    listenCount: Number(row.listenCount),
  }))
}

export interface TopTrackStat {
  trackId: string
  trackTitle: string
  artistId: string
  artistName: string
  albumId: string | null
  albumTitle: string | null
  listenCount: number
}

interface TopTrackRow {
  trackId: string
  trackTitle: string
  artistId: string
  artistName: string
  albumId: string | null
  albumTitle: string | null
  listenCount: bigint | number
}

export async function topTracks(range: DateRange = {}, limit = 10, db: Db = prisma): Promise<TopTrackStat[]> {
  const rows = await db.$queryRaw<TopTrackRow[]>`
    SELECT
      t.id AS trackId, t.title AS trackTitle,
      ar.id AS artistId, ar.name AS artistName,
      al.id AS albumId, al.title AS albumTitle,
      COUNT(*) AS listenCount
    FROM Listen l
    JOIN Track t ON t.id = l.trackId
    JOIN Artist ar ON ar.id = t.artistId
    LEFT JOIN Album al ON al.id = t.albumId
    ${dateRangeWhere('l.playedAt', range)}
    GROUP BY t.id, t.title, ar.id, ar.name, al.id, al.title
    ORDER BY listenCount DESC
    LIMIT ${limit}
  `
  return rows.map((row) => ({
    trackId: row.trackId,
    trackTitle: row.trackTitle,
    artistId: row.artistId,
    artistName: row.artistName,
    albumId: row.albumId,
    albumTitle: row.albumTitle,
    listenCount: Number(row.listenCount),
  }))
}

// --- Distribución de géneros escuchados ---------------------------------------------

export interface GenreListenStat {
  genreId: string
  genreName: string
  genreColor: string | null
  listenCount: number
}

interface GenreListenRow {
  genreId: string
  genreName: string
  genreColor: string | null
  listenCount: bigint | number
}

/**
 * Distribución de géneros escuchados, para graficar.
 *
 * El género "efectivo" de una canción es el suyo propio (`TrackGenre`) si lo tiene, o
 * si no, el de su álbum (`AlbumGenre`) — así una canción sin género propio no queda
 * fuera de la gráfica sólo porque el catálogo no llegó a etiquetarla individualmente.
 * Una escucha cuenta una vez por cada género que le aplique.
 */
export async function genreDistribution(range: DateRange = {}, db: Db = prisma): Promise<GenreListenStat[]> {
  const rows = await db.$queryRaw<GenreListenRow[]>`
    WITH track_effective_genre AS (
      SELECT tg.trackId AS trackId, tg.genreId AS genreId
      FROM TrackGenre tg
      UNION ALL
      SELECT t.id AS trackId, ag.genreId AS genreId
      FROM Track t
      JOIN AlbumGenre ag ON ag.albumId = t.albumId
      WHERE NOT EXISTS (SELECT 1 FROM TrackGenre tg2 WHERE tg2.trackId = t.id)
    )
    SELECT g.id AS genreId, g.name AS genreName, g.color AS genreColor, COUNT(*) AS listenCount
    FROM Listen l
    JOIN track_effective_genre teg ON teg.trackId = l.trackId
    JOIN Genre g ON g.id = teg.genreId
    ${dateRangeWhere('l.playedAt', range)}
    GROUP BY g.id, g.name, g.color
    ORDER BY listenCount DESC
  `
  return rows.map((row) => ({
    genreId: row.genreId,
    genreName: row.genreName,
    genreColor: row.genreColor,
    listenCount: Number(row.listenCount),
  }))
}

// --- Actividad por mes -----------------------------------------------------------

export interface MonthlyActivityStat {
  /** Formato "YYYY-MM". */
  month: string
  listenCount: number
}

interface MonthlyActivityRow {
  month: string
  listenCount: bigint | number
}

export async function monthlyActivity(range: DateRange = {}, db: Db = prisma): Promise<MonthlyActivityStat[]> {
  const rows = await db.$queryRaw<MonthlyActivityRow[]>`
    SELECT strftime('%Y-%m', playedAt) AS month, COUNT(*) AS listenCount
    FROM Listen l
    ${dateRangeWhere('l.playedAt', range)}
    GROUP BY month
    ORDER BY month ASC
  `
  return rows.map((row) => ({ month: row.month, listenCount: Number(row.listenCount) }))
}

// --- Totales del panel principal ----------------------------------------------------

export interface Totals {
  totalListens: number
  distinctArtists: number
  totalReviews: number
  averageRating: number | null
  averageStars: number | null
}

/**
 * Totales para el panel principal: escuchas, artistas distintos, reseñas escritas y
 * calificación promedio. El rango de fechas, si se da, acota las escuchas por
 * `playedAt` y las reseñas por `createdAt`.
 */
export async function getTotals(range: DateRange = {}, db: Db = prisma): Promise<Totals> {
  const [listenRows, reviewRows] = await Promise.all([
    db.$queryRaw<{ totalListens: bigint | number; distinctArtists: bigint | number }[]>`
      SELECT COUNT(*) AS totalListens, COUNT(DISTINCT t.artistId) AS distinctArtists
      FROM Listen l
      JOIN Track t ON t.id = l.trackId
      ${dateRangeWhere('l.playedAt', range)}
    `,
    db.$queryRaw<{ totalReviews: bigint | number; averageRating: number | null }[]>`
      SELECT COUNT(*) AS totalReviews, AVG(r.rating) AS averageRating
      FROM Review r
      ${dateRangeWhere('r.createdAt', range)}
    `,
  ])

  const listenRow = listenRows[0]
  const reviewRow = reviewRows[0]
  const averageRating = reviewRow?.averageRating ?? null

  return {
    totalListens: Number(listenRow?.totalListens ?? 0),
    distinctArtists: Number(listenRow?.distinctArtists ?? 0),
    totalReviews: Number(reviewRow?.totalReviews ?? 0),
    averageRating,
    averageStars: averageRating != null ? ratingToStars(averageRating) : null,
  }
}
