import { describe, expect, it, vi } from 'vitest'
import { SpotifyApiError, SpotifyClient } from './client'
import recentlyPlayedFixture from './__fixtures__/recently-played.json'
import artistsFixture from './__fixtures__/artists.json'

type FetchFn = typeof fetch

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as Response
}

function fakeTokenProvider(token: string, refreshedToken = 'token-refrescado') {
  const getAccessToken = vi.fn(async (options?: { forceRefresh?: boolean }) =>
    options?.forceRefresh ? refreshedToken : token,
  )
  return { getAccessToken }
}

describe('SpotifyClient.getRecentlyPlayed', () => {
  it('parsea las reproducciones recientes y arma la URL con el cursor after', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, recentlyPlayedFixture))
    const tokens = fakeTokenProvider('token-valido')
    const client = new SpotifyClient(tokens, { fetchFn })

    const result = await client.getRecentlyPlayed({ after: 1721380800000 })

    expect(result.items).toHaveLength(3)
    expect(result.items[0].track.name).toBe('Déjà Vu')
    expect(result.items[0].played_at).toBe('2026-07-20T10:15:30.123Z')
    expect(result.cursors?.after).toBe('1784629800000')

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(String(url)).toContain('/me/player/recently-played')
    expect(String(url)).toContain('after=1721380800000')
    expect(String(url)).toContain('limit=50')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer token-valido' })
  })

  it('pide sin after cuando no se pasa cursor (primera sincronización)', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, recentlyPlayedFixture))
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn })

    await client.getRecentlyPlayed()

    const [url] = fetchFn.mock.calls[0]
    expect(String(url)).not.toContain('after=')
  })
})

describe('SpotifyClient.getArtists', () => {
  it('devuelve los artistas con sus géneros', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(200, artistsFixture))
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn })

    const artists = await client.getArtists(['artist_les_amies', 'artist_ruido_util'])

    expect(artists).toHaveLength(2)
    expect(artists[0].genres).toEqual(['dream pop', 'shoegaze'])
  })

  it('no hace ninguna petición si la lista de ids está vacía', async () => {
    const fetchFn = vi.fn<FetchFn>()
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn })

    const artists = await client.getArtists([])

    expect(artists).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('SpotifyClient — límite de tasa (429)', () => {
  it('respeta Retry-After y reintenta la misma petición', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'rate limited' }, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse(200, recentlyPlayedFixture))
    const wait = vi.fn(async () => undefined)
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn, wait })

    const result = await client.getRecentlyPlayed()

    expect(result.items).toHaveLength(3)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledExactlyOnceWith(2000)
  })

  it('usa 1 segundo por defecto si Spotify no manda Retry-After', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'rate limited' }))
      .mockResolvedValueOnce(jsonResponse(200, recentlyPlayedFixture))
    const wait = vi.fn(async () => undefined)
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn, wait })

    await client.getRecentlyPlayed()

    expect(wait).toHaveBeenCalledExactlyOnceWith(1000)
  })

  it('se rinde después del número máximo de intentos', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(429, {}, { 'Retry-After': '0' }))
    const wait = vi.fn(async () => undefined)
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn, wait, maxAttempts: 2 })

    await expect(client.getRecentlyPlayed()).rejects.toThrow(SpotifyApiError)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('SpotifyClient — token expirado (401)', () => {
  it('pide un token refrescado y reintenta una vez', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid token' }))
      .mockResolvedValueOnce(jsonResponse(200, recentlyPlayedFixture))
    const tokens = fakeTokenProvider('token-vencido', 'token-nuevo')
    const client = new SpotifyClient(tokens, { fetchFn })

    const result = await client.getRecentlyPlayed()

    expect(result.items).toHaveLength(3)
    expect(tokens.getAccessToken).toHaveBeenCalledTimes(2)
    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(1, { forceRefresh: false })
    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true })

    const [, secondInit] = fetchFn.mock.calls[1]
    expect((secondInit as RequestInit).headers).toMatchObject({ Authorization: 'Bearer token-nuevo' })
  })

  it('lanza SpotifyApiError si sigue en 401 tras refrescar', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(401, {}))
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn })

    await expect(client.getRecentlyPlayed()).rejects.toThrow(SpotifyApiError)
  })
})

describe('SpotifyClient — otros errores', () => {
  it('lanza SpotifyApiError con el body para errores no manejados', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(500, { error: 'server error' }))
    const client = new SpotifyClient(fakeTokenProvider('t'), { fetchFn })

    await expect(client.getCurrentUserProfile()).rejects.toMatchObject({
      status: 500,
      body: { error: 'server error' },
    })
  })
})
