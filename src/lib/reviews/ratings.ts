import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { ratingToStars } from '@/lib/schemas'

type Db = typeof prisma

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
export async function averageRatingByArtist(artistId?: string, db: Db = prisma): Promise<ArtistRatingStat[]> {
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
    ${artistId ? Prisma.sql`WHERE ar.id = ${artistId}` : Prisma.empty}
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
export async function averageRatingByGenre(genreId?: string, db: Db = prisma): Promise<GenreRatingStat[]> {
  const rows = await db.$queryRaw<GenreRatingRow[]>`
    WITH review_genres AS (
      SELECT r.id AS reviewId, r.rating AS rating, ag.genreId AS genreId
      FROM Review r
      JOIN AlbumGenre ag ON ag.albumId = r.albumId
      WHERE r.albumId IS NOT NULL
      UNION ALL
      SELECT r.id AS reviewId, r.rating AS rating, tg.genreId AS genreId
      FROM Review r
      JOIN TrackGenre tg ON tg.trackId = r.trackId
      WHERE r.trackId IS NOT NULL
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
