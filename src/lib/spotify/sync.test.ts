// Pruebas de integración de `syncSpotifyListens` contra una base SQLite temporal de
// verdad (no un mock de Prisma): se aplican las migraciones reales con
// `prisma migrate deploy` sobre un archivo temporal y se usa un `PrismaClient` propio
// apuntando a ese archivo. Así la prueba de idempotencia ejerce la restricción real
// UNIQUE(trackId, playedAt) de la base de datos, que es la que de verdad garantiza que
// sincronizar dos veces no duplica escuchas — no basta con confiar en la lógica de la
// aplicación.
//
// No sale a la red: `prisma migrate deploy` sólo aplica SQL ya generado localmente
// (carpeta prisma/migrations), no contacta ningún servidor.

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import type { SpotifyListenSource } from './client'
import { syncSpotifyListens } from './sync'
import type { SpotifyArtist, SpotifyRecentlyPlayedResponse } from './types'
import recentlyPlayedFixture from './__fixtures__/recently-played.json'
import artistsFixture from './__fixtures__/artists.json'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

let tmpDir: string
let dbPath: string
let db: PrismaClient

/** Cliente falso que siempre devuelve el mismo fixture, sin importar el cursor `after`. */
function fixtureClient(overrides: Partial<SpotifyListenSource> = {}): SpotifyListenSource {
  return {
    getRecentlyPlayed: async () => recentlyPlayedFixture as SpotifyRecentlyPlayedResponse,
    getArtists: async (ids: string[]) =>
      (artistsFixture.artists as SpotifyArtist[]).filter((a) => ids.includes(a.id)),
    ...overrides,
  }
}

async function seedAccount(lastSyncedAt: Date | null = null) {
  await db.spotifyAccount.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      scope: 'user-read-recently-played user-read-email',
      spotifyUserId: 'spotify_user_123',
      displayName: 'Memo',
      lastSyncedAt,
    },
    update: { lastSyncedAt },
  })
}

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'memo-spotify-sync-test-'))
  dbPath = path.join(tmpDir, `test-${randomUUID()}.db`)

  execSync('npx prisma migrate deploy', {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  })

  db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }) })
}, 30_000)

afterAll(async () => {
  await db?.$disconnect()
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
})

describe('syncSpotifyListens', () => {
  it('falla con un mensaje claro si no hay cuenta de Spotify conectada', async () => {
    await expect(syncSpotifyListens(fixtureClient(), { db })).rejects.toThrow(
      /no hay ninguna cuenta de spotify conectada/i,
    )
  })

  it('importa artistas, álbumes, canciones y escuchas desde el fixture', async () => {
    await seedAccount(null)

    const summary = await syncSpotifyListens(fixtureClient(), { db, now: () => new Date('2026-07-25T12:00:00Z') })

    expect(summary.listensFound).toBe(3)
    expect(summary.listensCreated).toBe(3)
    expect(summary.listensSkipped).toBe(0)
    expect(summary.artistsCreated).toBe(2)
    expect(summary.albumsCreated).toBe(2)
    expect(summary.tracksCreated).toBe(3)
    expect(summary.possibleGap).toBe(false)
    // La sincronización avanza hasta la reproducción más reciente del fixture, no hasta "now".
    expect(summary.syncedThrough).toEqual(new Date('2026-07-20T10:15:30.123Z'))

    expect(await db.listen.count()).toBe(3)
    expect(await db.artist.count()).toBe(2)
    expect(await db.album.count()).toBe(2)
    expect(await db.track.count()).toBe(3)

    const account = await db.spotifyAccount.findUniqueOrThrow({ where: { id: 'singleton' } })
    expect(account.lastSyncedAt).toEqual(new Date('2026-07-20T10:15:30.123Z'))

    // Los géneros del artista se importaron con source SPOTIFY.
    const artist = await db.artist.findUniqueOrThrow({
      where: { spotifyId: 'artist_les_amies' },
      include: { genres: { include: { genre: true } } },
    })
    const genreSlugs = artist.genres.map((g) => g.genre.slug).sort()
    expect(genreSlugs).toEqual(['dream-pop', 'shoegaze'])
    expect(artist.genres.every((g) => g.source === 'SPOTIFY')).toBe(true)

    // El single se clasificó como SINGLE, el álbum de 10 canciones como LP.
    const single = await db.album.findUniqueOrThrow({ where: { spotifyId: 'album_estatico_single' } })
    expect(single.albumType).toBe('SINGLE')
    const lp = await db.album.findUniqueOrThrow({ where: { spotifyId: 'album_espejismo' } })
    expect(lp.albumType).toBe('LP')
  })

  it('sincronizar dos veces el mismo historial no duplica escuchas ni catálogo', async () => {
    // Las pruebas anteriores ya insertaron escuchas con este mismo fixture en la base
    // compartida; se limpian para que esta prueba controle su propio punto de partida
    // (el catálogo — artistas/álbumes/canciones — se deja intacto a propósito, para
    // comprobar también que reimportarlo no lo duplica).
    await db.listen.deleteMany()
    await seedAccount(null)
    const before = await syncSpotifyListens(fixtureClient(), { db })
    expect(before.listensCreated).toBe(3)

    const listensBeforeSecondRun = await db.listen.count()
    const artistsBeforeSecondRun = await db.artist.count()
    const albumsBeforeSecondRun = await db.album.count()
    const tracksBeforeSecondRun = await db.track.count()

    // Segunda corrida con el mismo fixture, sin tocar lastSyncedAt manualmente: el cliente
    // falso vuelve a devolver las mismas 3 reproducciones.
    const after = await syncSpotifyListens(fixtureClient(), { db })

    expect(after.listensFound).toBe(3)
    expect(after.listensCreated).toBe(0)
    expect(after.listensSkipped).toBe(3)
    expect(after.artistsCreated).toBe(0)
    expect(after.albumsCreated).toBe(0)
    expect(after.tracksCreated).toBe(0)

    // Ninguna tabla creció: ni las escuchas ni el catálogo se duplicaron.
    expect(await db.listen.count()).toBe(listensBeforeSecondRun)
    expect(await db.artist.count()).toBe(artistsBeforeSecondRun)
    expect(await db.album.count()).toBe(albumsBeforeSecondRun)
    expect(await db.track.count()).toBe(tracksBeforeSecondRun)
  })

  it('marca possibleGap cuando Spotify devuelve el máximo de 50 reproducciones', async () => {
    await seedAccount(null)

    const manyItems = Array.from({ length: 50 }, (_, i) => ({
      track: recentlyPlayedFixture.items[0].track,
      played_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    }))

    const summary = await syncSpotifyListens(
      fixtureClient({ getRecentlyPlayed: async () => ({ items: manyItems, next: null, cursors: null, limit: 50 }) }),
      { db },
    )

    expect(summary.listensFound).toBe(50)
    expect(summary.possibleGap).toBe(true)
  })

  it('no falla y sólo actualiza lastSyncedAt cuando no hay reproducciones nuevas', async () => {
    await seedAccount(new Date('2026-07-25T00:00:00.000Z'))

    const summary = await syncSpotifyListens(
      fixtureClient({ getRecentlyPlayed: async () => ({ items: [], next: null, cursors: null, limit: 50 }) }),
      { db, now: () => new Date('2026-07-25T12:00:00.000Z') },
    )

    expect(summary.listensFound).toBe(0)
    expect(summary.listensCreated).toBe(0)
    expect(summary.possibleGap).toBe(false)

    const account = await db.spotifyAccount.findUniqueOrThrow({ where: { id: 'singleton' } })
    expect(account.lastSyncedAt).toEqual(new Date('2026-07-25T12:00:00.000Z'))
  })
})
