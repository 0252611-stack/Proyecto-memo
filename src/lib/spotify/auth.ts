// Flujo de autorización de Spotify (Authorization Code) y persistencia de tokens.
//
// Los tokens se guardan en el modelo `SpotifyAccount` (fila única, id "singleton") en vez
// de en la sesión: así la sincronización puede correr sin que haya nadie con el navegador
// abierto (p. ej. desde una tarea programada). `getValidAccessToken` es el único punto de
// entrada que el resto de la integración debería usar para obtener un access token: sabe
// refrescarlo solo cuando hace falta.
//
// `fetch` se inyecta explícitamente en cada función que llama a la red (nunca se usa
// `globalThis.fetch` directamente), igual que en `client.ts` y en `lib/catalog`.

import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import type { SpotifyAccessTokenProvider } from './client'
import type { SpotifyTokenResponse } from './types'

type FetchFn = typeof fetch

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

/**
 * Scopes mínimos: sólo lo que la app necesita. `user-read-recently-played` para
 * sincronizar el historial y `user-read-email` para identificar la cuenta conectada.
 * No se piden scopes de escritura ni de reproducción: Memo nunca controla Spotify, sólo
 * lee.
 */
export const SPOTIFY_SCOPES = ['user-read-recently-played', 'user-read-email'] as const

/** Margen de refresco: si al token le quedan menos de esto, se refresca antes de usarlo. */
const REFRESH_MARGIN_MS = 60_000

/** Se lanza ante cualquier fallo del flujo OAuth (config faltante, Spotify rechaza, etc.). */
export class SpotifyAuthError extends Error {
  readonly status?: number
  readonly body?: unknown

  constructor(message: string, status?: number, body?: unknown) {
    super(message)
    this.name = 'SpotifyAuthError'
    this.status = status
    this.body = body
  }
}

export interface SpotifyOAuthConfig {
  clientId: string
  clientSecret: string
}

/** Lee client id/secret de las variables de entorno (ver `.env.example`). */
export function getSpotifyOAuthConfigFromEnv(): SpotifyOAuthConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new SpotifyAuthError(
      'Faltan SPOTIFY_CLIENT_ID y/o SPOTIFY_CLIENT_SECRET. Configúralos en .env (ver .env.example).',
    )
  }
  return { clientId, clientSecret }
}

/** Construye la URL de redirección por defecto a partir de `AUTH_URL` (ver `.env.example`). */
export function getRedirectUriFromEnv(): string {
  const authUrl = process.env.AUTH_URL ?? 'http://localhost:3000'
  return `${authUrl.replace(/\/+$/, '')}/api/auth/callback/spotify`
}

/** Genera un `state` aleatorio para el flujo OAuth (protección contra CSRF). */
export function generateState(): string {
  return randomBytes(16).toString('hex')
}

/** Construye la URL a la que se redirige al usuario para autorizar la app. */
export function buildAuthorizeUrl(options: {
  clientId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('state', options.state)
  url.searchParams.set('scope', (options.scopes ?? SPOTIFY_SCOPES).join(' '))
  return url.toString()
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

async function postToken(
  fetchFn: FetchFn,
  config: SpotifyOAuthConfig,
  body: URLSearchParams,
): Promise<SpotifyTokenResponse> {
  const response = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
    },
    body: body.toString(),
  })

  if (!response.ok) {
    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      // El cuerpo no era JSON; se lanza el error sin él.
    }
    throw new SpotifyAuthError(
      `Spotify respondió ${response.status} al intercambiar el token`,
      response.status,
      responseBody,
    )
  }

  return (await response.json()) as SpotifyTokenResponse
}

/** Intercambia el `code` del callback de autorización por un access + refresh token. */
export async function exchangeCodeForTokens(
  fetchFn: FetchFn,
  config: SpotifyOAuthConfig,
  options: { code: string; redirectUri: string },
): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri,
  })
  return postToken(fetchFn, config, body)
}

/** Pide un access token nuevo a partir del refresh token guardado. */
export async function refreshAccessToken(
  fetchFn: FetchFn,
  config: SpotifyOAuthConfig,
  refreshToken: string,
): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return postToken(fetchFn, config, body)
}

// --- Persistencia --------------------------------------------------------------------

export interface SpotifyAccountRecord {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
  spotifyUserId: string | null
  displayName: string | null
  lastSyncedAt: Date | null
}

/**
 * Lo que este módulo necesita para persistir la cuenta de Spotify: una interfaz mínima
 * (no todo `PrismaClient`) para poder probar `getValidAccessToken` con un almacén en
 * memoria, sin tocar una base de datos real. La implementación por defecto
 * (`prismaSpotifyAccountStore`) usa la fila "singleton" del modelo `SpotifyAccount`.
 */
export interface SpotifyAccountStore {
  get(): Promise<SpotifyAccountRecord | null>
  save(data: Partial<SpotifyAccountRecord>): Promise<SpotifyAccountRecord>
}

export const prismaSpotifyAccountStore: SpotifyAccountStore = {
  async get() {
    return prisma.spotifyAccount.findUnique({ where: { id: 'singleton' } })
  },
  async save(data) {
    return prisma.spotifyAccount.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        accessToken: data.accessToken ?? '',
        refreshToken: data.refreshToken ?? '',
        expiresAt: data.expiresAt ?? new Date(),
        scope: data.scope ?? '',
        spotifyUserId: data.spotifyUserId ?? undefined,
        displayName: data.displayName ?? undefined,
        lastSyncedAt: data.lastSyncedAt ?? undefined,
      },
      update: {
        ...(data.accessToken !== undefined && { accessToken: data.accessToken }),
        ...(data.refreshToken !== undefined && { refreshToken: data.refreshToken }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
        ...(data.scope !== undefined && { scope: data.scope }),
        ...(data.spotifyUserId !== undefined && { spotifyUserId: data.spotifyUserId }),
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.lastSyncedAt !== undefined && { lastSyncedAt: data.lastSyncedAt }),
      },
    })
  },
}

function tokenResponseToRecord(
  tokens: SpotifyTokenResponse,
  now: Date,
  previousRefreshToken?: string,
): Partial<SpotifyAccountRecord> {
  return {
    accessToken: tokens.access_token,
    // Spotify no siempre rota el refresh token al refrescar; si no manda uno nuevo, se
    // conserva el anterior.
    refreshToken: tokens.refresh_token ?? previousRefreshToken,
    expiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    scope: tokens.scope,
  }
}

/** Guarda el resultado de `exchangeCodeForTokens` como la cuenta de Spotify conectada. */
export async function persistTokens(
  tokens: SpotifyTokenResponse,
  extra: { spotifyUserId?: string; displayName?: string } = {},
  options: { store?: SpotifyAccountStore; now?: () => Date } = {},
): Promise<SpotifyAccountRecord> {
  const store = options.store ?? prismaSpotifyAccountStore
  const now = options.now?.() ?? new Date()
  const existing = await store.get()
  return store.save({
    ...tokenResponseToRecord(tokens, now, existing?.refreshToken),
    ...extra,
  })
}

export interface GetValidAccessTokenOptions {
  store?: SpotifyAccountStore
  fetchFn?: FetchFn
  /** Reloj inyectable para pruebas; por defecto `() => new Date()`. */
  now?: () => Date
  config?: SpotifyOAuthConfig
  /** Fuerza el refresco aunque el token guardado todavía no haya expirado (ver 401 en `client.ts`). */
  forceRefresh?: boolean
}

/**
 * Devuelve un access token válido, refrescándolo automáticamente si `expiresAt` ya pasó
 * o está a menos de 60s de pasar (o si `forceRefresh` se pide explícitamente). Es la
 * única función que el resto de la integración debería llamar para obtener un token.
 */
export async function getValidAccessToken(options: GetValidAccessTokenOptions = {}): Promise<string> {
  const store = options.store ?? prismaSpotifyAccountStore
  const now = options.now ?? (() => new Date())
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis)

  const account = await store.get()
  if (!account) {
    throw new SpotifyAuthError('No hay ninguna cuenta de Spotify conectada. Autoriza la app primero.')
  }

  const nowDate = now()
  const msUntilExpiry = account.expiresAt.getTime() - nowDate.getTime()
  const needsRefresh = options.forceRefresh === true || msUntilExpiry <= REFRESH_MARGIN_MS
  if (!needsRefresh) {
    return account.accessToken
  }

  const config = options.config ?? getSpotifyOAuthConfigFromEnv()
  const tokens = await refreshAccessToken(fetchFn, config, account.refreshToken)
  const updated = await store.save(tokenResponseToRecord(tokens, nowDate, account.refreshToken))
  return updated.accessToken
}

/**
 * Adaptador para usar con `SpotifyClient`: implementa `SpotifyAccessTokenProvider`
 * delegando en `getValidAccessToken`. Es lo que conecta `auth.ts` (que sabe de Prisma y
 * de OAuth) con `client.ts` (que no sabe de ninguno de los dos).
 */
export function createAccountTokenProvider(
  options: GetValidAccessTokenOptions = {},
): SpotifyAccessTokenProvider {
  return {
    getAccessToken: (callOptions) =>
      getValidAccessToken({
        ...options,
        forceRefresh: callOptions?.forceRefresh ?? options.forceRefresh,
      }),
  }
}
