// Sincronización de reproducciones de Spotify hacia el modelo `Listen`.
//
// LIMITACIÓN IMPORTANTE DE LA API DE SPOTIFY (léase antes de tocar este archivo):
// `GET /v1/me/player/recently-played` devuelve como máximo las últimas 50 reproducciones
// y Spotify **no conserva historial más largo en absoluto** — no existe un endpoint para
// pedir "todo lo escuchado desde tal fecha" si eso implica más de 50 canciones. Mientras
// la sincronización corra con más frecuencia que "cada 50 canciones escuchadas" no se
// pierde nada. Pero si pasan semanas sin sincronizar y en ese lapso se escucharon más de
// 50 canciones, las más antiguas de ese hueco ya no están disponibles en la API y no hay
// forma de recuperarlas retroactivamente: sólo se importan las que Spotify todavía
// retiene. Por eso esta función no intenta "paginar hacia atrás" para rellenar huecos
// (el cursor `after` de Spotify tampoco serviría para eso: con `after` siempre se
// obtienen las reproducciones *más recientes* posteriores al cursor, no las 50
// siguientes en orden cronológico). Cuando la respuesta viene con el límite de 50
// canciones alcanzado, el resumen marca `possibleGap: true` para que la interfaz pueda
// avisar de que probablemente falten reproducciones intermedias.
//
// Idempotencia: cada reproducción se identifica por (trackId, playedAt), que es el
// UNIQUE del modelo `Listen`. Antes de crear una fila se verifica si ya existe; si la
// misma sincronización (o una que se solape) corre de nuevo con el mismo historial, las
// reproducciones repetidas se cuentan como "omitidas" en vez de duplicarse.

import type { PrismaClient } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { slugifyGenre } from '@/lib/schemas'
import type { SpotifyListenSource } from './client'
import type { SpotifyAlbum, SpotifyArtistRef, SpotifyTrack } from './types'

type PrismaTx = Pick<
  PrismaClient,
  'spotifyAccount' | 'artist' | 'album' | 'track' | 'genre' | 'artistGenre' | 'listen'
>

export interface SyncSummary {
  /** Cuántos elementos trajo Spotify en esta corrida (antes de deduplicar). */
  listensFound: number
  listensCreated: number
  /** Reproducciones que ya existían (misma trackId+playedAt) — la sincronización es idempotente. */
  listensSkipped: number
  artistsCreated: number
  albumsCreated: number
  tracksCreated: number
  /** Instante hasta el que quedó sincronizado (nuevo `lastSyncedAt`). */
  syncedThrough: Date
  /**
   * true si Spotify devolvió exactamente el máximo de 50 elementos: es señal de que
   * probablemente hubo más reproducciones de las que la API puede devolver y algunas
   * quedaron fuera (ver comentario de cabecera). No hay forma de confirmarlo con certeza
   * ni de recuperar lo perdido; es sólo una advertencia para mostrar en la interfaz.
   */
  possibleGap: boolean
}

export interface SyncOptions {
  /** Cliente de Prisma a usar; por defecto el singleton de `lib/db`. Inyectable para pruebas. */
  db?: PrismaTx
  /** Reloj inyectable para pruebas; por defecto `() => new Date()`. */
  now?: () => Date
}

const RECENTLY_PLAYED_LIMIT = 50

/**
 * Trae las reproducciones recientes desde `lastSyncedAt` (o las últimas 50 si nunca se
 * ha sincronizado), las convierte en filas de Artist/Album/Track/Listen y actualiza
 * `lastSyncedAt`. Requiere que ya exista una cuenta de Spotify conectada (ver `auth.ts`).
 */
export async function syncSpotifyListens(
  client: SpotifyListenSource,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const db = options.db ?? prisma
  const now = options.now?.() ?? new Date()

  const account = await db.spotifyAccount.findUnique({ where: { id: 'singleton' } })
  if (!account) {
    throw new Error('No hay ninguna cuenta de Spotify conectada. Autoriza la app primero.')
  }

  const after = account.lastSyncedAt ? account.lastSyncedAt.getTime() : undefined
  const response = await client.getRecentlyPlayed({ after, limit: RECENTLY_PLAYED_LIMIT })
  const items = response.items

  const summary: SyncSummary = {
    listensFound: items.length,
    listensCreated: 0,
    listensSkipped: 0,
    artistsCreated: 0,
    albumsCreated: 0,
    tracksCreated: 0,
    syncedThrough: now,
    possibleGap: items.length >= RECENTLY_PLAYED_LIMIT,
  }

  if (items.length === 0) {
    await db.spotifyAccount.update({ where: { id: 'singleton' }, data: { lastSyncedAt: now } })
    return summary
  }

  // Los géneros sólo vienen en /v1/artists — ni el track ni el álbum embebidos los traen.
  // Se piden todos los artistas únicos de la página en una sola llamada.
  const artistIds = new Set<string>()
  for (const item of items) {
    for (const a of item.track.artists) artistIds.add(a.id)
    for (const a of item.track.album.artists) artistIds.add(a.id)
  }
  const artistDetails = await client.getArtists([...artistIds])
  const genresByArtistId = new Map(artistDetails.map((a) => [a.id, a.genres ?? []]))

  let latestPlayedAt: Date | null = null

  for (const item of items) {
    const playedAt = new Date(item.played_at)
    if (!latestPlayedAt || playedAt > latestPlayedAt) latestPlayedAt = playedAt

    const trackId = await upsertTrackHierarchy(db, item.track, genresByArtistId, summary)
    const created = await createListenIfMissing(db, trackId, playedAt)
    if (created) summary.listensCreated++
    else summary.listensSkipped++
  }

  summary.syncedThrough = latestPlayedAt ?? now
  await db.spotifyAccount.update({
    where: { id: 'singleton' },
    data: { lastSyncedAt: summary.syncedThrough },
  })

  return summary
}

/**
 * Crea la reproducción si no existe ya una con el mismo (trackId, playedAt). Spotify no
 * informa cuánto del track se escuchó realmente (sólo que la reproducción quedó
 * registrada), así que `msPlayed` se deja sin definir para las escuchas de origen
 * Spotify — inventar ese dato sería peor que no tenerlo.
 */
async function createListenIfMissing(db: PrismaTx, trackId: string, playedAt: Date): Promise<boolean> {
  const existing = await db.listen.findUnique({ where: { trackId_playedAt: { trackId, playedAt } } })
  if (existing) return false
  await db.listen.create({ data: { trackId, playedAt, source: 'SPOTIFY' } })
  return true
}

async function upsertTrackHierarchy(
  db: PrismaTx,
  track: SpotifyTrack,
  genresByArtistId: Map<string, string[]>,
  summary: SyncSummary,
): Promise<string> {
  const trackArtistRef = track.artists[0]
  const albumArtistRef = track.album.artists[0] ?? trackArtistRef

  const trackArtistId = await upsertArtist(db, trackArtistRef, genresByArtistId, summary)
  const albumArtistId =
    albumArtistRef.id === trackArtistRef.id
      ? trackArtistId
      : await upsertArtist(db, albumArtistRef, genresByArtistId, summary)

  const albumId = await upsertAlbum(db, track.album, albumArtistId, summary)

  const existing = await db.track.findUnique({ where: { spotifyId: track.id } })
  const data = {
    title: track.name,
    artistId: trackArtistId,
    albumId,
    trackNumber: track.track_number,
    discNumber: track.disc_number,
    durationMs: track.duration_ms,
  }
  const saved = existing
    ? await db.track.update({ where: { spotifyId: track.id }, data })
    : await db.track.create({ data: { spotifyId: track.id, ...data } })
  if (!existing) summary.tracksCreated++
  return saved.id
}

async function upsertArtist(
  db: PrismaTx,
  ref: SpotifyArtistRef,
  genresByArtistId: Map<string, string[]>,
  summary: SyncSummary,
): Promise<string> {
  const existing = await db.artist.findUnique({ where: { spotifyId: ref.id } })
  const saved = existing
    ? await db.artist.update({ where: { spotifyId: ref.id }, data: { name: ref.name } })
    : await db.artist.create({ data: { spotifyId: ref.id, name: ref.name } })
  if (!existing) summary.artistsCreated++

  for (const genreName of genresByArtistId.get(ref.id) ?? []) {
    const genreId = await resolveGenreId(db, genreName)
    if (!genreId) continue
    await db.artistGenre.upsert({
      where: { artistId_genreId: { artistId: saved.id, genreId } },
      update: {},
      create: { artistId: saved.id, genreId, source: 'SPOTIFY' },
    })
  }

  return saved.id
}

async function upsertAlbum(
  db: PrismaTx,
  album: SpotifyAlbum,
  artistId: string,
  summary: SyncSummary,
): Promise<string> {
  const existing = await db.album.findUnique({ where: { spotifyId: album.id } })
  const data = {
    title: album.name,
    artistId,
    albumType: mapAlbumType(album.album_type, album.total_tracks),
    releaseDate: parseReleaseDate(album.release_date),
    coverUrl: album.images?.[0]?.url,
    totalTracks: album.total_tracks,
  }
  const saved = existing
    ? await db.album.update({ where: { spotifyId: album.id }, data })
    : await db.album.create({ data: { spotifyId: album.id, ...data } })
  if (!existing) summary.albumsCreated++
  return saved.id
}

async function resolveGenreId(db: PrismaTx, name: string): Promise<string | null> {
  const slug = slugifyGenre(name)
  if (!slug) return null
  const genre = await db.genre.upsert({ where: { slug }, update: {}, create: { name, slug } })
  return genre.id
}

/**
 * Spotify sólo distingue 'album' | 'single' | 'compilation' — no tiene un tipo "EP"
 * propio. Se usa un heurístico común (álbum con pocas canciones) para acercarse a los
 * tipos que maneja Memo; no es perfecto, pero es mejor que catalogar todo EP como LP.
 */
function mapAlbumType(spotifyType: string, totalTracks?: number): 'LP' | 'EP' | 'SINGLE' | 'COMPILATION' {
  if (spotifyType === 'single') return 'SINGLE'
  if (spotifyType === 'compilation') return 'COMPILATION'
  if (totalTracks !== undefined && totalTracks > 0 && totalTracks <= 6) return 'EP'
  return 'LP'
}

/**
 * Spotify da la fecha con precisión variable: sólo año ("1985"), año-mes ("1985-04") o
 * completa ("1985-04-13"). `new Date("1985")` la interpreta en UTC pero `new
 * Date("1985-04")` no es un formato ISO estándar en todos los motores, así que se arman
 * las fechas parciales a mano para no depender de esa ambigüedad.
 */
function parseReleaseDate(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined
  if (/^\d{4}$/.test(dateStr)) return new Date(Date.UTC(Number(dateStr), 0, 1))
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(dateStr)
  if (yearMonth) return new Date(Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1))
  const parsed = new Date(dateStr)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
