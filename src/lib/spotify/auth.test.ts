import { describe, expect, it, vi } from 'vitest'
import {
  SPOTIFY_SCOPES,
  SpotifyAuthError,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  generateState,
  getValidAccessToken,
  persistTokens,
  refreshAccessToken,
  type SpotifyAccountRecord,
  type SpotifyAccountStore,
} from './auth'
import tokenExchangeFixture from './__fixtures__/token-exchange-response.json'
import tokenRefreshFixture from './__fixtures__/token-refresh-response.json'

type FetchFn = typeof fetch

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

/** Almacén en memoria que implementa `SpotifyAccountStore`, para probar sin tocar la base de datos. */
function memoryStore(initial: SpotifyAccountRecord | null): SpotifyAccountStore & { record: SpotifyAccountRecord | null } {
  const store = {
    record: initial,
    async get() {
      return store.record
    },
    async save(data: Partial<SpotifyAccountRecord>) {
      const merged: SpotifyAccountRecord = {
        accessToken: data.accessToken ?? store.record?.accessToken ?? '',
        refreshToken: data.refreshToken ?? store.record?.refreshToken ?? '',
        expiresAt: data.expiresAt ?? store.record?.expiresAt ?? new Date(0),
        scope: data.scope ?? store.record?.scope ?? '',
        spotifyUserId: data.spotifyUserId ?? store.record?.spotifyUserId ?? null,
        displayName: data.displayName ?? store.record?.displayName ?? null,
        lastSyncedAt: data.lastSyncedAt ?? store.record?.lastSyncedAt ?? null,
      }
      store.record = merged
      return merged
    },
  }
  return store
}

describe('buildAuthorizeUrl', () => {
  it('incluye client_id, redirect_uri, state y sólo los scopes mínimos', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'http://localhost:3000/api/auth/callback/spotify',
        state: 'estado-abc',
      }),
    )

    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/spotify')
    expect(url.searchParams.get('state')).toBe('estado-abc')
    expect(url.searchParams.get('scope')).toBe('user-read-recently-played user-read-email')
    expect(SPOTIFY_SCOPES).toEqual(['user-read-recently-played', 'user-read-email'])
  })
})

describe('generateState', () => {
  it('genera valores distintos y no vacíos en cada llamada', () => {
    const a = generateState()
    const b = generateState()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(16)
    expect(b.length).toBeGreaterThanOrEqual(16)
  })
})

describe('exchangeCodeForTokens', () => {
  it('hace POST con Basic auth y grant_type authorization_code', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, tokenExchangeFixture))

    const tokens = await exchangeCodeForTokens(
      fetchFn,
      { clientId: 'cid', clientSecret: 'csecret' },
      { code: 'auth-code-123', redirectUri: 'http://localhost:3000/api/auth/callback/spotify' },
    )

    expect(tokens.access_token).toBe('access-token-inicial')
    expect(tokens.refresh_token).toBe('refresh-token-inicial')

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://accounts.spotify.com/api/token')
    const requestInit = init as RequestInit
    expect(requestInit.method).toBe('POST')
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('cid:csecret').toString('base64')}`,
    )
    const body = new URLSearchParams(requestInit.body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code-123')
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/spotify')
  })

  it('lanza SpotifyAuthError si Spotify responde con error', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(400, { error: 'invalid_grant' }))

    await expect(
      exchangeCodeForTokens(
        fetchFn,
        { clientId: 'cid', clientSecret: 'csecret' },
        { code: 'malo', redirectUri: 'http://localhost:3000/cb' },
      ),
    ).rejects.toThrow(SpotifyAuthError)
  })
})

describe('refreshAccessToken', () => {
  it('hace POST con grant_type refresh_token', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, tokenRefreshFixture))

    const tokens = await refreshAccessToken(fetchFn, { clientId: 'cid', clientSecret: 'csecret' }, 'refresh-viejo')

    expect(tokens.access_token).toBe('access-token-refrescado')
    const [, init] = fetchFn.mock.calls[0]
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-viejo')
  })
})

describe('persistTokens', () => {
  it('guarda los tokens del intercambio inicial en el store', async () => {
    const store = memoryStore(null)
    const now = () => new Date('2026-07-25T12:00:00.000Z')

    const saved = await persistTokens(
      { access_token: 'a', token_type: 'Bearer', scope: 'user-read-email', expires_in: 3600 },
      { spotifyUserId: 'user-1', displayName: 'Memo' },
      { store, now },
    )

    expect(saved.accessToken).toBe('a')
    expect(saved.spotifyUserId).toBe('user-1')
    expect(saved.expiresAt).toEqual(new Date('2026-07-25T13:00:00.000Z'))
  })
})

describe('getValidAccessToken', () => {
  it('devuelve el token guardado sin refrescar si todavía es válido', async () => {
    const store = memoryStore({
      accessToken: 'token-vigente',
      refreshToken: 'refresh-1',
      expiresAt: new Date('2026-07-25T13:00:00.000Z'),
      scope: 'user-read-email',
      spotifyUserId: null,
      displayName: null,
      lastSyncedAt: null,
    })
    const fetchFn = vi.fn<FetchFn>()
    const now = () => new Date('2026-07-25T12:00:00.000Z') // faltan 60 min, muy por encima del margen

    const token = await getValidAccessToken({ store, fetchFn, now })

    expect(token).toBe('token-vigente')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refresca automáticamente cuando el token ya expiró', async () => {
    const store = memoryStore({
      accessToken: 'token-vencido',
      refreshToken: 'refresh-1',
      expiresAt: new Date('2026-07-25T11:00:00.000Z'), // expiró hace 1 hora
      scope: 'user-read-email',
      spotifyUserId: 'user-1',
      displayName: 'Memo',
      lastSyncedAt: new Date('2026-07-24T00:00:00.000Z'),
    })
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, tokenRefreshFixture))
    const now = () => new Date('2026-07-25T12:00:00.000Z')

    const token = await getValidAccessToken({
      store,
      fetchFn,
      now,
      config: { clientId: 'cid', clientSecret: 'csecret' },
    })

    expect(token).toBe('access-token-refrescado')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    // El fixture de refresco no trae refresh_token nuevo: se debe conservar el anterior.
    expect(store.record?.refreshToken).toBe('refresh-1')
    // No debe perderse la información de la cuenta que no viene en la respuesta de refresco.
    expect(store.record?.spotifyUserId).toBe('user-1')
    expect(store.record?.lastSyncedAt).toEqual(new Date('2026-07-24T00:00:00.000Z'))
  })

  it('refresca cuando el token expira dentro del margen de 60 segundos', async () => {
    const store = memoryStore({
      accessToken: 'token-por-vencer',
      refreshToken: 'refresh-1',
      expiresAt: new Date('2026-07-25T12:00:30.000Z'), // faltan 30s: dentro del margen
      scope: 'user-read-email',
      spotifyUserId: null,
      displayName: null,
      lastSyncedAt: null,
    })
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, tokenRefreshFixture))
    const now = () => new Date('2026-07-25T12:00:00.000Z')

    const token = await getValidAccessToken({
      store,
      fetchFn,
      now,
      config: { clientId: 'cid', clientSecret: 'csecret' },
    })

    expect(token).toBe('access-token-refrescado')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('refresca si se pide forceRefresh aunque el token siga vigente', async () => {
    const store = memoryStore({
      accessToken: 'token-vigente',
      refreshToken: 'refresh-1',
      expiresAt: new Date('2026-07-25T13:00:00.000Z'),
      scope: 'user-read-email',
      spotifyUserId: null,
      displayName: null,
      lastSyncedAt: null,
    })
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, tokenRefreshFixture))
    const now = () => new Date('2026-07-25T12:00:00.000Z')

    const token = await getValidAccessToken({
      store,
      fetchFn,
      now,
      forceRefresh: true,
      config: { clientId: 'cid', clientSecret: 'csecret' },
    })

    expect(token).toBe('access-token-refrescado')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('lanza SpotifyAuthError si no hay ninguna cuenta conectada', async () => {
    const store = memoryStore(null)
    await expect(getValidAccessToken({ store })).rejects.toThrow(SpotifyAuthError)
  })
})
