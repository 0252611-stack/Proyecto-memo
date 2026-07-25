// Cliente de la Web API de Spotify (https://api.spotify.com/v1).
//
// `fetch` se inyecta (constructor) para poder probar esta clase sin salir a la red real;
// nunca se llama a `globalThis.fetch` directamente en la lógica interna. El proveedor de
// access token también se inyecta (`SpotifyAccessTokenProvider`): este módulo no sabe
// nada de OAuth ni de Prisma, sólo pide un token válido y, si Spotify lo rechaza, pide
// uno refrescado. Quien conecta ambas piezas es `auth.ts` (ver `createAccountTokenProvider`).
//
// Manejo de errores transitorios:
//   - 429 (límite de tasa): se respeta la cabecera `Retry-After` (en segundos) antes de
//     reintentar. No se fuerza un refresco de token para esto.
//   - 401 (token inválido o expirado): se pide un token con `forceRefresh: true` y se
//     reintenta una vez. Si Spotify vuelve a responder 401 con un token fresco, no tiene
//     sentido seguir reintentando y se lanza el error.
//   - Cualquier otro código de error (4xx/5xx no manejado arriba) se lanza como
//     `SpotifyApiError`, con el body de la respuesta cuando se puede parsear.

import type {
  SpotifyAlbum,
  SpotifyAlbumsResponse,
  SpotifyArtist,
  SpotifyArtistsResponse,
  SpotifyRecentlyPlayedResponse,
  SpotifyTrack,
  SpotifyTracksResponse,
  SpotifyUserProfile,
} from './types'

type FetchFn = typeof fetch

const DEFAULT_BASE_URL = 'https://api.spotify.com/v1'
// Intento inicial + hasta 2 reintentos (cubre, por ejemplo, un 429 seguido de un 401).
const DEFAULT_MAX_ATTEMPTS = 3

/** Se lanza cuando Spotify responde con un error que el cliente no puede resolver solo. */
export class SpotifyApiError extends Error {
  readonly status: number
  readonly body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Lo que `SpotifyClient` necesita para autenticar sus peticiones. `forceRefresh: true`
 * significa "el token que me diste la última vez ya no sirve, dame uno nuevo aunque
 * según tu reloj todavía no haya expirado" — así es como el cliente reacciona a un 401.
 */
export interface SpotifyAccessTokenProvider {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>
}

/**
 * Subconjunto de `SpotifyClient` que necesita la sincronización de reproducciones
 * (`sync.ts`). Tipar contra esta interfaz en vez de la clase concreta permite probar la
 * sincronización con un cliente falso mínimo, sin construir un `SpotifyClient` real.
 */
export interface SpotifyListenSource {
  getRecentlyPlayed(params?: {
    after?: number
    before?: number
    limit?: number
  }): Promise<SpotifyRecentlyPlayedResponse>
  getArtists(ids: string[]): Promise<SpotifyArtist[]>
}

export interface SpotifyClientOptions {
  /** `fetch` a usar; por defecto el global. Inyectable para pruebas. */
  fetchFn?: FetchFn
  /** URL base de la API; por defecto la de producción de Spotify. */
  baseUrl?: string
  /** Función de espera, inyectable para que las pruebas no esperen tiempo real. */
  wait?: (ms: number) => Promise<void>
  /** Intentos totales (inicial + reintentos) antes de rendirse. Por defecto 3. */
  maxAttempts?: number
}

export class SpotifyClient implements SpotifyListenSource {
  private readonly tokens: SpotifyAccessTokenProvider
  private readonly fetchFn: FetchFn
  private readonly baseUrl: string
  private readonly wait: (ms: number) => Promise<void>
  private readonly maxAttempts: number

  constructor(tokens: SpotifyAccessTokenProvider, options: SpotifyClientOptions = {}) {
    this.tokens = tokens
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis)
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  }

  async getCurrentUserProfile(): Promise<SpotifyUserProfile> {
    return this.request<SpotifyUserProfile>('/me')
  }

  /**
   * Reproducciones recientes. `after` es un cursor en **milisegundos** (epoch): Spotify
   * devuelve las reproducciones posteriores a ese instante, más recientes primero, hasta
   * `limit` (máximo y por defecto 50 — Spotify no permite pedir más ni conserva más).
   */
  async getRecentlyPlayed(
    params: { after?: number; before?: number; limit?: number } = {},
  ): Promise<SpotifyRecentlyPlayedResponse> {
    const search = new URLSearchParams()
    search.set('limit', String(params.limit ?? 50))
    if (params.after !== undefined) search.set('after', String(params.after))
    if (params.before !== undefined) search.set('before', String(params.before))
    return this.request<SpotifyRecentlyPlayedResponse>(`/me/player/recently-played?${search}`)
  }

  async getTracks(ids: string[]): Promise<SpotifyTrack[]> {
    if (ids.length === 0) return []
    const data = await this.request<SpotifyTracksResponse>(`/tracks?ids=${ids.join(',')}`)
    return data.tracks
  }

  async getAlbums(ids: string[]): Promise<SpotifyAlbum[]> {
    if (ids.length === 0) return []
    const data = await this.request<SpotifyAlbumsResponse>(`/albums?ids=${ids.join(',')}`)
    return data.albums
  }

  /** Único endpoint que trae géneros: ni las canciones ni los álbumes los incluyen. */
  async getArtists(ids: string[]): Promise<SpotifyArtist[]> {
    if (ids.length === 0) return []
    const data = await this.request<SpotifyArtistsResponse>(`/artists?ids=${ids.join(',')}`)
    return data.artists
  }

  private async request<T>(path: string, attempt = 1, forceRefresh = false): Promise<T> {
    const token = await this.tokens.getAccessToken({ forceRefresh })
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`

    const response = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    if (response.status === 429) {
      if (attempt >= this.maxAttempts) {
        throw new SpotifyApiError(
          `Spotify respondió 429 (límite de tasa) tras ${attempt} intentos para ${path}`,
          429,
        )
      }
      const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '1')
      const waitMs = (Number.isFinite(retryAfterSeconds) ? Math.max(retryAfterSeconds, 0) : 1) * 1000
      await this.wait(waitMs)
      return this.request<T>(path, attempt + 1, false)
    }

    if (response.status === 401) {
      if (attempt >= this.maxAttempts) {
        throw new SpotifyApiError(
          `Spotify respondió 401 para ${path} incluso tras refrescar el token`,
          401,
        )
      }
      return this.request<T>(path, attempt + 1, true)
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        // El cuerpo no era JSON (o venía vacío); se lanza el error sin él.
      }
      throw new SpotifyApiError(`Spotify respondió ${response.status} para ${path}`, response.status, body)
    }

    return (await response.json()) as T
  }
}
