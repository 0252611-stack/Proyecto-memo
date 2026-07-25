// Formas de la API Web de Spotify (crudas) y tipos de tokens.
//
// Estos tipos son intencionalmente mínimos: sólo los campos que esta integración usa,
// no el contrato completo de Spotify. Igual que en `lib/catalog`, el resto de la
// aplicación no debería importar estos tipos directamente — `sync.ts` es quien traduce
// esta forma cruda a las tablas de Prisma.

export interface SpotifyImage {
  url: string
  height?: number | null
  width?: number | null
}

/** Referencia mínima a un artista, tal como aparece embebida en canciones y álbumes. */
export interface SpotifyArtistRef {
  id: string
  name: string
}

/** Artista completo, tal como lo devuelve `GET /v1/artists`. Sólo aquí vienen los géneros. */
export interface SpotifyArtist extends SpotifyArtistRef {
  genres?: string[]
  images?: SpotifyImage[]
  popularity?: number
}

export interface SpotifyAlbum {
  id: string
  name: string
  /** 'album' | 'single' | 'compilation'. Spotify no distingue "EP" como tipo propio. */
  album_type: string
  artists: SpotifyArtistRef[]
  images?: SpotifyImage[]
  /** Formato variable: "1985", "1985-04" o "1985-04-13" según `release_date_precision`. */
  release_date?: string
  release_date_precision?: string
  total_tracks?: number
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtistRef[]
  album: SpotifyAlbum
  duration_ms: number
  track_number?: number
  disc_number?: number
}

/** Un elemento del historial de reproducciones recientes. */
export interface SpotifyPlayHistoryItem {
  track: SpotifyTrack
  /** ISO 8601, p. ej. "2026-07-20T10:15:30.123Z". */
  played_at: string
}

export interface SpotifyCursors {
  after?: string
  before?: string
}

export interface SpotifyRecentlyPlayedResponse {
  items: SpotifyPlayHistoryItem[]
  next?: string | null
  cursors?: SpotifyCursors | null
  limit: number
}

export interface SpotifyUserProfile {
  id: string
  display_name?: string | null
  email?: string | null
}

export interface SpotifyArtistsResponse {
  artists: SpotifyArtist[]
}

export interface SpotifyAlbumsResponse {
  albums: SpotifyAlbum[]
}

export interface SpotifyTracksResponse {
  tracks: SpotifyTrack[]
}

/** Respuesta de `POST /api/token`, tanto para el intercambio inicial como para el refresco. */
export interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  /** Sólo viene en el intercambio inicial y, a veces, en el refresco (token rotado). */
  refresh_token?: string
}
