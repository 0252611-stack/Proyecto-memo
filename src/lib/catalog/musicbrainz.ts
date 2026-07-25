// Implementación de MusicCatalogSource contra la API pública de MusicBrainz
// (https://musicbrainz.org/ws/2/, fmt=json).
//
// Reglas duras que impone MusicBrainz y que esta clase debe respetar:
//   1. User-Agent identificable en cada petición (si no, MusicBrainz puede bloquear).
//   2. Máximo 1 petición por segundo — se implementa con una cola que encadena las
//      peticiones, no con un `sleep` por llamada (eso no protegería contra ráfagas de
//      llamadas concurrentes).
//   3. Un 503 significa "estás excediendo el límite de tasa": hay que reintentar con
//      espera exponencial, como máximo 3 intentos en total.
//
// `fetch` se inyecta (constructor o parámetro) para poder probar esta clase sin salir a
// la red real; nunca se llama a `globalThis.fetch` directamente en la lógica interna.

import type {
  CatalogAlbum,
  CatalogAlbumDetail,
  CatalogArtist,
  CatalogTrack,
  MusicCatalogSource,
} from './types'

const DEFAULT_BASE_URL = 'https://musicbrainz.org/ws/2'
const MIN_INTERVAL_MS = 1000 // MusicBrainz exige como máximo 1 petición/segundo
const MAX_ATTEMPTS = 3 // intento inicial + hasta 2 reintentos ante 503

type FetchFn = typeof fetch

/** Se lanza cuando MusicBrainz responde 404 para un recurso puntual (p. ej. un release). */
export class MusicBrainzNotFoundError extends Error {
  constructor(path: string) {
    super(`MusicBrainz: no se encontró el recurso en ${path}`)
    this.name = 'MusicBrainzNotFoundError'
  }
}

/** Se lanza cuando MusicBrainz sigue respondiendo 503 tras agotar los reintentos. */
export class MusicBrainzRateLimitError extends Error {
  constructor(path: string, attempts: number) {
    super(`MusicBrainz respondió 503 (límite de tasa) tras ${attempts} intentos para ${path}.`)
    this.name = 'MusicBrainzRateLimitError'
  }
}

export interface MusicBrainzCatalogSourceOptions {
  /** `fetch` a usar; por defecto el global. Inyectable para pruebas. */
  fetchFn?: FetchFn
  /** User-Agent a enviar; por defecto `process.env.MUSICBRAINZ_USER_AGENT`. */
  userAgent?: string
  /** URL base de la API; por defecto la de producción de MusicBrainz. */
  baseUrl?: string
  /** Función de espera, inyectable para que las pruebas no esperen tiempo real. */
  wait?: (ms: number) => Promise<void>
}

// --- Formas crudas de la API de MusicBrainz (fmt=json) ---------------------------------
// Estos tipos son intencionalmente internos: no se exportan desde el módulo. El resto de
// la aplicación sólo conoce los tipos neutrales de ./types.

interface MusicBrainzGenreTag {
  name: string
  count?: number
}

interface MusicBrainzLifeSpan {
  begin?: string
  end?: string
  ended?: boolean
}

interface MusicBrainzArtistJson {
  id: string
  name: string
  'sort-name'?: string
  country?: string
  'life-span'?: MusicBrainzLifeSpan
  genres?: MusicBrainzGenreTag[]
  tags?: MusicBrainzGenreTag[]
  disambiguation?: string
}

interface MusicBrainzArtistSearchResponse {
  artists?: MusicBrainzArtistJson[]
}

interface MusicBrainzArtistCredit {
  name: string
  artist: { id: string; name: string }
}

interface MusicBrainzReleaseGroup {
  'primary-type'?: string
  'secondary-types'?: string[]
}

interface MusicBrainzCoverArtArchive {
  artwork?: boolean
  front?: boolean
  back?: boolean
  count?: number
  darkened?: boolean
}

interface MusicBrainzReleaseJson {
  id: string
  title: string
  date?: string
  'artist-credit'?: MusicBrainzArtistCredit[]
  'release-group'?: MusicBrainzReleaseGroup
  'track-count'?: number
  genres?: MusicBrainzGenreTag[]
  tags?: MusicBrainzGenreTag[]
  'cover-art-archive'?: MusicBrainzCoverArtArchive
}

interface MusicBrainzReleaseSearchResponse {
  releases?: MusicBrainzReleaseJson[]
}

interface MusicBrainzRecording {
  id: string
  title: string
  length?: number
  genres?: MusicBrainzGenreTag[]
  tags?: MusicBrainzGenreTag[]
}

interface MusicBrainzTrackJson {
  id: string
  number: string
  position: number
  title?: string
  length?: number
  recording?: MusicBrainzRecording
}

interface MusicBrainzMediumJson {
  position: number
  'track-count'?: number
  tracks?: MusicBrainzTrackJson[]
}

interface MusicBrainzReleaseDetailJson extends MusicBrainzReleaseJson {
  media?: MusicBrainzMediumJson[]
}

// --- Parseo: de la forma cruda de MusicBrainz a los tipos neutrales del catálogo -------

function extractGenres(genres?: MusicBrainzGenreTag[], tags?: MusicBrainzGenreTag[]): string[] {
  const names = new Set<string>()
  for (const g of genres ?? []) {
    if (g.name) names.add(g.name.toLowerCase())
  }
  for (const t of tags ?? []) {
    if (t.name) names.add(t.name.toLowerCase())
  }
  return [...names]
}

function parseYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined
  const year = Number.parseInt(dateStr.slice(0, 4), 10)
  return Number.isNaN(year) ? undefined : year
}

function parseArtist(a: MusicBrainzArtistJson): CatalogArtist {
  return {
    sourceId: a.id,
    name: a.name,
    sortName: a['sort-name'],
    country: a.country,
    formedYear: parseYear(a['life-span']?.begin),
    genres: extractGenres(a.genres, a.tags),
    disambiguation: a.disambiguation || undefined,
  }
}

function mapAlbumType(rg?: MusicBrainzReleaseGroup): CatalogAlbum['albumType'] {
  const secondaryTypes = rg?.['secondary-types'] ?? []
  if (secondaryTypes.includes('Compilation')) return 'COMPILATION'

  switch (rg?.['primary-type']) {
    case 'Single':
      return 'SINGLE'
    case 'EP':
      return 'EP'
    default:
      return 'LP' // "Album" y cualquier otro caso se tratan como LP
  }
}

function coverArtUrl(releaseId: string): string {
  return `https://coverartarchive.org/release/${releaseId}/front`
}

function parseRelease(r: MusicBrainzReleaseJson): CatalogAlbum {
  const credit = r['artist-credit']?.[0]
  return {
    sourceId: r.id,
    title: r.title,
    artistSourceId: credit?.artist.id ?? '',
    artistName: credit?.name ?? credit?.artist.name ?? '',
    albumType: mapAlbumType(r['release-group']),
    releaseDate: r.date,
    coverUrl: r['cover-art-archive']?.front ? coverArtUrl(r.id) : undefined,
    totalTracks: r['track-count'],
    genres: extractGenres(r.genres, r.tags),
  }
}

function parseTrack(t: MusicBrainzTrackJson): CatalogTrack {
  const parsedNumber = Number.parseInt(t.number, 10)
  return {
    sourceId: t.recording?.id ?? t.id,
    title: t.title ?? t.recording?.title ?? '',
    trackNumber: Number.isNaN(parsedNumber) ? t.position : parsedNumber,
    durationMs: t.length ?? t.recording?.length,
    genres: extractGenres(t.recording?.genres, t.recording?.tags),
  }
}

function parseReleaseDetail(r: MusicBrainzReleaseDetailJson): CatalogAlbumDetail {
  const album = parseRelease(r)
  const tracks: CatalogTrack[] = []
  for (const medium of r.media ?? []) {
    for (const rawTrack of medium.tracks ?? []) {
      tracks.push({ ...parseTrack(rawTrack), discNumber: medium.position })
    }
  }
  return { ...album, tracks }
}

// --- Cliente ------------------------------------------------------------------------

export class MusicBrainzCatalogSource implements MusicCatalogSource {
  private readonly fetchFn: FetchFn
  private readonly userAgent: string
  private readonly baseUrl: string
  private readonly wait: (ms: number) => Promise<void>

  // Cola de peticiones: cada llamada se encadena a la anterior. Así, sin importar
  // cuántas peticiones se disparen "a la vez" (p. ej. varias búsquedas concurrentes),
  // se sirven de una en una y separadas por al menos MIN_INTERVAL_MS. Un `sleep` fijo
  // por llamada no lograría esto bajo concurrencia: dos llamadas que arrancan juntas
  // dormirían el mismo tiempo y golpearían la API casi simultáneamente.
  private queue: Promise<void> = Promise.resolve()
  private lastRequestAt = 0

  constructor(options: MusicBrainzCatalogSourceOptions = {}) {
    const userAgent = options.userAgent ?? process.env.MUSICBRAINZ_USER_AGENT
    if (!userAgent) {
      throw new Error(
        'Falta MUSICBRAINZ_USER_AGENT. MusicBrainz exige un User-Agent identificable; ' +
          'configúralo en .env (ver .env.example).',
      )
    }
    this.userAgent = userAgent
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis)
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  async searchArtists(query: string): Promise<CatalogArtist[]> {
    const data = await this.enqueue<MusicBrainzArtistSearchResponse>('/artist', {
      query,
      fmt: 'json',
    })
    return (data.artists ?? []).map(parseArtist)
  }

  async searchAlbums(
    query: string,
    options?: { artistSourceId?: string },
  ): Promise<CatalogAlbum[]> {
    const luceneQuery = options?.artistSourceId
      ? `${query} AND arid:${options.artistSourceId}`
      : query
    const data = await this.enqueue<MusicBrainzReleaseSearchResponse>('/release', {
      query: luceneQuery,
      fmt: 'json',
      inc: 'genres+tags',
    })
    return (data.releases ?? []).map(parseRelease)
  }

  async getAlbumDetail(albumSourceId: string): Promise<CatalogAlbumDetail | null> {
    try {
      const data = await this.enqueue<MusicBrainzReleaseDetailJson>(
        `/release/${albumSourceId}`,
        { fmt: 'json', inc: 'recordings+artist-credits+release-groups+genres+tags' },
      )
      return parseReleaseDetail(data)
    } catch (err) {
      if (err instanceof MusicBrainzNotFoundError) return null
      throw err
    }
  }

  /** Encola una petición en la cola de limitación de tasa y devuelve su resultado. */
  private enqueue<T>(path: string, params: Record<string, string>): Promise<T> {
    const result = this.queue.then(() => this.throttledFetch<T>(path, params))
    // La cola en sí nunca debe quedar "rota" por un rechazo: si una petición falla, las
    // siguientes deben poder seguir ejecutándose respetando el límite de tasa.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async throttledFetch<T>(path: string, params: Record<string, string>): Promise<T> {
    const elapsed = Date.now() - this.lastRequestAt
    if (this.lastRequestAt > 0 && elapsed < MIN_INTERVAL_MS) {
      await this.wait(MIN_INTERVAL_MS - elapsed)
    }
    return this.fetchWithRetry<T>(path, params, 1)
  }

  private async fetchWithRetry<T>(
    path: string,
    params: Record<string, string>,
    attempt: number,
  ): Promise<T> {
    this.lastRequestAt = Date.now()

    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    const response = await this.fetchFn(url.toString(), {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    })

    if (response.status === 503) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new MusicBrainzRateLimitError(path, attempt)
      }
      // Espera exponencial: 1s, 2s, ... antes de reintentar.
      const backoffMs = MIN_INTERVAL_MS * 2 ** (attempt - 1)
      await this.wait(backoffMs)
      return this.fetchWithRetry<T>(path, params, attempt + 1)
    }

    if (response.status === 404) {
      throw new MusicBrainzNotFoundError(path)
    }

    if (!response.ok) {
      throw new Error(`MusicBrainz respondió ${response.status} para ${path}`)
    }

    return (await response.json()) as T
  }
}
