// Persistencia de resultados del catálogo con Prisma.
//
// Estas funciones toman lo que devuelve un MusicCatalogSource (tipos neutrales de
// ./types) y lo guardan como Artist / Album / Track / Genre. Son idempotentes: importar
// el mismo artista o álbum dos veces no duplica nada, porque cada entidad se deduplica
// por su `mbid` (único en el esquema) mediante `upsert`.
//
// Los nombres de las funciones dicen "musicBrainz" porque hoy `mbid` es el único campo
// de deduplicación por proveedor que existe en el esquema; si se añadiera otro proveedor
// con su propio identificador, estas funciones seguirían siendo el único lugar que sabe
// traducir "resultado de catálogo" a "filas en la base de datos".

import type { PrismaClient } from '@/generated/prisma/client'
import { slugifyGenre } from '@/lib/schemas'
import type { CatalogAlbum, CatalogAlbumDetail, CatalogArtist } from './types'

type PrismaTx = Pick<
  PrismaClient,
  'artist' | 'album' | 'track' | 'genre' | 'artistGenre' | 'albumGenre' | 'trackGenre'
>

/**
 * Obtiene el id del género con ese nombre, creándolo si no existe. Reutiliza el género
 * existente cuando el slug ya está en uso (dos nombres distintos que normalizan igual,
 * p. ej. "Hip Hop" y "hip-hop", no deberían producir dos filas).
 */
async function resolveGenreId(db: PrismaTx, name: string): Promise<string> {
  const slug = slugifyGenre(name)
  const genre = await db.genre.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  })
  return genre.id
}

async function linkArtistGenre(db: PrismaTx, artistId: string, genreId: string): Promise<void> {
  await db.artistGenre.upsert({
    where: { artistId_genreId: { artistId, genreId } },
    update: {},
    create: { artistId, genreId, source: 'MUSICBRAINZ' },
  })
}

async function linkAlbumGenre(db: PrismaTx, albumId: string, genreId: string): Promise<void> {
  await db.albumGenre.upsert({
    where: { albumId_genreId: { albumId, genreId } },
    update: {},
    create: { albumId, genreId, source: 'MUSICBRAINZ' },
  })
}

async function linkTrackGenre(db: PrismaTx, trackId: string, genreId: string): Promise<void> {
  await db.trackGenre.upsert({
    where: { trackId_genreId: { trackId, genreId } },
    update: {},
    create: { trackId, genreId, source: 'MUSICBRAINZ' },
  })
}

/**
 * Crea o actualiza un artista a partir de un resultado de catálogo, deduplicando por
 * `mbid`. Devuelve el id de la fila en la base de datos.
 */
export async function importArtist(db: PrismaTx, artist: CatalogArtist): Promise<string> {
  const saved = await db.artist.upsert({
    where: { mbid: artist.sourceId },
    update: {
      name: artist.name,
      sortName: artist.sortName,
      country: artist.country,
      formedYear: artist.formedYear,
    },
    create: {
      mbid: artist.sourceId,
      name: artist.name,
      sortName: artist.sortName,
      country: artist.country,
      formedYear: artist.formedYear,
    },
  })

  for (const genreName of artist.genres) {
    const genreId = await resolveGenreId(db, genreName)
    await linkArtistGenre(db, saved.id, genreId)
  }

  return saved.id
}

/**
 * Crea o actualiza un álbum (sin sus canciones) a partir de un resultado de catálogo,
 * deduplicando por `mbid`. El artista debe existir ya (usa `importArtist` primero, o
 * pasa `artistId` explícito si ya lo tienes).
 */
export async function importAlbum(
  db: PrismaTx,
  album: CatalogAlbum,
  artistId: string,
): Promise<string> {
  const releaseDate = album.releaseDate ? new Date(album.releaseDate) : undefined

  const saved = await db.album.upsert({
    where: { mbid: album.sourceId },
    update: {
      title: album.title,
      artistId,
      albumType: album.albumType,
      releaseDate,
      coverUrl: album.coverUrl,
      totalTracks: album.totalTracks,
    },
    create: {
      mbid: album.sourceId,
      title: album.title,
      artistId,
      albumType: album.albumType,
      releaseDate,
      coverUrl: album.coverUrl,
      totalTracks: album.totalTracks,
    },
  })

  for (const genreName of album.genres) {
    const genreId = await resolveGenreId(db, genreName)
    await linkAlbumGenre(db, saved.id, genreId)
  }

  return saved.id
}

/**
 * Importa un álbum completo con sus canciones: crea/actualiza el artista, el álbum y
 * cada canción, resolviendo géneros en las tres entidades. Es la función pensada para
 * usarse desde la UI de importación ("buscar álbum → importar").
 *
 * Idempotente de punta a punta: volver a importar el mismo álbum (mismo mbid) actualiza
 * en vez de duplicar, tanto para el álbum como para cada canción y cada relación de
 * género.
 */
export async function importAlbumWithTracks(
  db: PrismaTx,
  artist: CatalogArtist,
  albumDetail: CatalogAlbumDetail,
): Promise<{ artistId: string; albumId: string; trackIds: string[] }> {
  const artistId = await importArtist(db, artist)
  const albumId = await importAlbum(db, albumDetail, artistId)

  const trackIds: string[] = []
  for (const track of albumDetail.tracks) {
    const saved = await db.track.upsert({
      where: { mbid: track.sourceId },
      update: {
        title: track.title,
        artistId,
        albumId,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        durationMs: track.durationMs,
      },
      create: {
        mbid: track.sourceId,
        title: track.title,
        artistId,
        albumId,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        durationMs: track.durationMs,
      },
    })

    for (const genreName of track.genres) {
      const genreId = await resolveGenreId(db, genreName)
      await linkTrackGenre(db, saved.id, genreId)
    }

    trackIds.push(saved.id)
  }

  return { artistId, albumId, trackIds }
}
