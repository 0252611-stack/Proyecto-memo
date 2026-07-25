import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicBrainzCatalogSource, MusicBrainzRateLimitError } from './musicbrainz'
import artistSearchFixture from './__fixtures__/artist-search-cafe-tacvba.json'
import releaseSearchFixture from './__fixtures__/release-search-re.json'
import releaseDetailFixture from './__fixtures__/release-detail-re.json'

// Estas pruebas nunca llaman a la red real: musicbrainz.org está bloqueado en este
// entorno (ver vitest.setup.ts, que hace explotar cualquier `fetch` sin sustituir).
// En su lugar se inyecta un `fetch` falso que devuelve fixtures grabados.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyResponse(status: number): Response {
  return new Response('', { status })
}

describe('MusicBrainzCatalogSource — parseo', () => {
  it('requiere un User-Agent', () => {
    const prevEnv = process.env.MUSICBRAINZ_USER_AGENT
    delete process.env.MUSICBRAINZ_USER_AGENT
    expect(() => new MusicBrainzCatalogSource({ fetchFn: vi.fn() as unknown as typeof fetch })).toThrow(
      /MUSICBRAINZ_USER_AGENT/,
    )
    process.env.MUSICBRAINZ_USER_AGENT = prevEnv
  })

  it('envía el User-Agent configurado en cada petición', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(artistSearchFixture))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'Memo/0.1 ( test@example.com )',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    await source.searchArtists('Café Tacvba')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/artist')
    expect(String(url)).toContain('fmt=json')
    expect((init as RequestInit).headers).toMatchObject({
      'User-Agent': 'Memo/0.1 ( test@example.com )',
    })
  })

  it('parsea artistas y combina genres + tags sin duplicados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(artistSearchFixture))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    const artists = await source.searchArtists('Café Tacvba')

    expect(artists).toHaveLength(1)
    expect(artists[0]).toMatchObject({
      sourceId: '1b2a6825-6e3a-4b1b-9f1e-8c1f8f6c8a11',
      name: 'Café Tacvba',
      sortName: 'Cafe Tacvba',
      country: 'MX',
      formedYear: 1989,
      disambiguation: 'banda de rock alternativo mexicana',
    })
    expect(artists[0].genres.sort()).toEqual(
      ['alternative rock', 'latin alternative', 'mexican', 'rock en español'].sort(),
    )
  })

  it('parsea álbumes, mapea el tipo y sólo pone portada si cover-art-archive.front es true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(releaseSearchFixture))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    const albums = await source.searchAlbums('Re')

    expect(albums).toHaveLength(2)
    expect(albums[0]).toMatchObject({
      sourceId: 'a3f1e9b0-9d8e-4b0a-9e3a-1234567890ab',
      title: 'Re',
      artistSourceId: '1b2a6825-6e3a-4b1b-9f1e-8c1f8f6c8a11',
      artistName: 'Café Tacvba',
      albumType: 'LP',
      releaseDate: '1994-09-14',
      totalTracks: 3,
    })
    expect(albums[0].coverUrl).toBe(
      'https://coverartarchive.org/release/a3f1e9b0-9d8e-4b0a-9e3a-1234567890ab/front',
    )
    // El segundo release es un Single sin portada disponible.
    expect(albums[1].albumType).toBe('SINGLE')
    expect(albums[1].coverUrl).toBeUndefined()
  })

  it('acota la búsqueda de álbumes por artista con arid: en la query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(releaseSearchFixture))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    await source.searchAlbums('Re', { artistSourceId: '1b2a6825-6e3a-4b1b-9f1e-8c1f8f6c8a11' })

    const [url] = fetchMock.mock.calls[0]
    const query = new URL(String(url)).searchParams.get('query')
    expect(query).toContain('arid:1b2a6825-6e3a-4b1b-9f1e-8c1f8f6c8a11')
  })

  it('obtiene el detalle de un álbum con sus canciones, número de disco y géneros por canción', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(releaseDetailFixture))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    const detail = await source.getAlbumDetail('a3f1e9b0-9d8e-4b0a-9e3a-1234567890ab')

    expect(detail).not.toBeNull()
    expect(detail?.tracks).toHaveLength(3)
    expect(detail?.tracks[0]).toMatchObject({
      sourceId: 'rec-1111-aaaa',
      title: 'El Aparato',
      trackNumber: 1,
      discNumber: 1,
      durationMs: 245000,
      genres: ['rock en español'],
    })
    expect(detail?.tracks[1].genres).toEqual(['ska'])
    expect(detail?.tracks[2].genres).toEqual([])
  })

  it('devuelve null cuando el álbum no existe (404)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(404))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    const detail = await source.getAlbumDetail('no-existe')

    expect(detail).toBeNull()
  })

  it('lanza un error legible ante un fallo genérico', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(500))
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: vi.fn().mockResolvedValue(undefined),
    })

    await expect(source.searchArtists('x')).rejects.toThrow(/500/)
  })
})

describe('MusicBrainzCatalogSource — limitación de tasa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializa peticiones concurrentes y espera lo necesario para no exceder 1 req/seg', async () => {
    // mockImplementation (no mockResolvedValue) para que cada llamada cree su propio
    // Response: el body de un Response sólo se puede leer una vez.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(artistSearchFixture))
    const waitMock = vi.fn().mockResolvedValue(undefined)
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: waitMock,
    })

    // Primera petición: no hay petición previa, no debería esperar.
    const first = source.searchArtists('a')
    // 300ms más tarde llega una segunda petición "simultánea".
    vi.setSystemTime(new Date('2026-07-25T00:00:00.300Z'))
    const second = source.searchArtists('b')

    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Sólo la segunda petición debió esperar, y por los ~700ms restantes hasta 1s.
    expect(waitMock).toHaveBeenCalledTimes(1)
    expect(waitMock.mock.calls[0][0]).toBe(700)
  })

  it('no espera entre peticiones si ya pasó más de 1 segundo', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(artistSearchFixture))
    const waitMock = vi.fn().mockResolvedValue(undefined)
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: waitMock,
    })

    await source.searchArtists('a')
    vi.setSystemTime(new Date('2026-07-25T00:00:01.500Z'))
    await source.searchArtists('b')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(waitMock).not.toHaveBeenCalled()
  })

  it('reintenta con espera exponencial ante 503 y respeta el máximo de 3 intentos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse(503))
      .mockResolvedValueOnce(emptyResponse(503))
      .mockResolvedValueOnce(jsonResponse(artistSearchFixture))
    const waitMock = vi.fn().mockResolvedValue(undefined)
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: waitMock,
    })

    const artists = await source.searchArtists('a')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(artists).toHaveLength(1)
    // Espera exponencial entre reintentos: 1s antes del 2º intento, 2s antes del 3º.
    expect(waitMock.mock.calls.map((c) => c[0])).toEqual([1000, 2000])
  })

  it('se rinde tras 3 intentos con 503 seguido y lanza MusicBrainzRateLimitError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(503))
    const waitMock = vi.fn().mockResolvedValue(undefined)
    const source = new MusicBrainzCatalogSource({
      fetchFn: fetchMock as unknown as typeof fetch,
      userAgent: 'test',
      wait: waitMock,
    })

    await expect(source.searchArtists('a')).rejects.toThrow(MusicBrainzRateLimitError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
