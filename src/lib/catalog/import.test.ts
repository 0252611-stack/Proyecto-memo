import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { importAlbum, importAlbumWithTracks, importArtist } from './import'
import type { CatalogAlbumDetail, CatalogArtist } from './types'

// Estas pruebas no salen a la red (SQLite es un archivo local, no una petición HTTP):
// levantan una base de datos temporal aplicando las migraciones reales del proyecto,
// para verificar la idempotencia de la importación contra el esquema de verdad.

const FIXTURE_DB_PATH = join(process.cwd(), 'src/lib/catalog/__fixtures__/.import-test.db')
const MIGRATIONS_DIR = join(process.cwd(), 'prisma/migrations')

function applyMigrations(db: Database) {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const dir of dirs) {
    const sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
    db.exec(sql)
  }
}

let prisma: PrismaClient

beforeAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    const p = FIXTURE_DB_PATH + suffix
    if (existsSync(p)) rmSync(p)
  }
  const raw = new Database(FIXTURE_DB_PATH)
  applyMigrations(raw)
  raw.close()
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${FIXTURE_DB_PATH}` }) })
})

afterAll(async () => {
  await prisma.$disconnect()
  for (const suffix of ['', '-shm', '-wal']) {
    const p = FIXTURE_DB_PATH + suffix
    if (existsSync(p)) rmSync(p)
  }
})

beforeEach(async () => {
  // Cada prueba parte de una base vacía para no depender del orden de ejecución.
  await prisma.review.deleteMany()
  await prisma.listen.deleteMany()
  await prisma.trackGenre.deleteMany()
  await prisma.albumGenre.deleteMany()
  await prisma.artistGenre.deleteMany()
  await prisma.track.deleteMany()
  await prisma.album.deleteMany()
  await prisma.artist.deleteMany()
  await prisma.genre.deleteMany()
})

const CAFE_TACVBA: CatalogArtist = {
  sourceId: '1b2a6825-6e3a-4b1b-9f1e-8c1f8f6c8a11',
  name: 'Café Tacvba',
  sortName: 'Cafe Tacvba',
  country: 'MX',
  formedYear: 1989,
  genres: ['rock en español', 'alternative rock'],
}

const RE_ALBUM_DETAIL: CatalogAlbumDetail = {
  sourceId: 'a3f1e9b0-9d8e-4b0a-9e3a-1234567890ab',
  title: 'Re',
  artistSourceId: CAFE_TACVBA.sourceId,
  artistName: CAFE_TACVBA.name,
  albumType: 'LP',
  releaseDate: '1994-09-14',
  coverUrl: 'https://coverartarchive.org/release/a3f1e9b0-9d8e-4b0a-9e3a-1234567890ab/front',
  totalTracks: 3,
  genres: ['rock en español'],
  tracks: [
    {
      sourceId: 'rec-1111-aaaa',
      title: 'El Aparato',
      trackNumber: 1,
      discNumber: 1,
      durationMs: 245000,
      genres: ['rock en español'],
    },
    {
      sourceId: 'rec-2222-bbbb',
      title: 'El Borrego',
      trackNumber: 2,
      discNumber: 1,
      durationMs: 198000,
      genres: ['ska'],
    },
    {
      sourceId: 'rec-3333-cccc',
      title: 'La Ingrata',
      trackNumber: 3,
      discNumber: 1,
      durationMs: 231000,
      genres: [],
    },
  ],
}

describe('importArtist', () => {
  it('crea el artista y sus géneros', async () => {
    const id = await importArtist(prisma, CAFE_TACVBA)

    const artist = await prisma.artist.findUniqueOrThrow({
      where: { id },
      include: { genres: { include: { genre: true } } },
    })
    expect(artist.name).toBe('Café Tacvba')
    expect(artist.mbid).toBe(CAFE_TACVBA.sourceId)
    expect(artist.genres.map((g) => g.genre.slug).sort()).toEqual(
      ['alternative-rock', 'rock-en-espanol'].sort(),
    )
  })

  it('es idempotente: importar dos veces el mismo artista no duplica nada', async () => {
    const id1 = await importArtist(prisma, CAFE_TACVBA)
    const id2 = await importArtist(prisma, CAFE_TACVBA)

    expect(id1).toBe(id2)
    expect(await prisma.artist.count()).toBe(1)
    expect(await prisma.genre.count()).toBe(2)
    expect(await prisma.artistGenre.count()).toBe(2)
  })

  it('reutiliza un género existente en vez de duplicarlo', async () => {
    await prisma.genre.create({ data: { name: 'Rock en Español', slug: 'rock-en-espanol' } })

    await importArtist(prisma, CAFE_TACVBA)

    const genres = await prisma.genre.findMany({ where: { slug: 'rock-en-espanol' } })
    expect(genres).toHaveLength(1)
    expect(genres[0].name).toBe('Rock en Español') // conserva el nombre ya existente
  })
})

describe('importAlbum', () => {
  it('crea el álbum ligado al artista y sus géneros', async () => {
    const artistId = await importArtist(prisma, CAFE_TACVBA)
    const albumId = await importAlbum(prisma, RE_ALBUM_DETAIL, artistId)

    const album = await prisma.album.findUniqueOrThrow({
      where: { id: albumId },
      include: { genres: { include: { genre: true } } },
    })
    expect(album.title).toBe('Re')
    expect(album.artistId).toBe(artistId)
    expect(album.albumType).toBe('LP')
    expect(album.releaseDate?.toISOString().slice(0, 10)).toBe('1994-09-14')
    expect(album.genres.map((g) => g.genre.slug)).toEqual(['rock-en-espanol'])
  })

  it('es idempotente por mbid', async () => {
    const artistId = await importArtist(prisma, CAFE_TACVBA)
    const id1 = await importAlbum(prisma, RE_ALBUM_DETAIL, artistId)
    const id2 = await importAlbum(prisma, RE_ALBUM_DETAIL, artistId)

    expect(id1).toBe(id2)
    expect(await prisma.album.count()).toBe(1)
  })
})

describe('importAlbumWithTracks', () => {
  it('crea artista, álbum y canciones con sus géneros', async () => {
    const result = await importAlbumWithTracks(prisma, CAFE_TACVBA, RE_ALBUM_DETAIL)

    expect(result.trackIds).toHaveLength(3)
    expect(await prisma.artist.count()).toBe(1)
    expect(await prisma.album.count()).toBe(1)
    expect(await prisma.track.count()).toBe(3)

    const tracks = await prisma.track.findMany({
      where: { albumId: result.albumId },
      include: { genres: { include: { genre: true } } },
      orderBy: { trackNumber: 'asc' },
    })
    expect(tracks.map((t) => t.title)).toEqual(['El Aparato', 'El Borrego', 'La Ingrata'])
    expect(tracks[0].genres.map((g) => g.genre.slug)).toEqual(['rock-en-espanol'])
    expect(tracks[2].genres).toEqual([]) // "La Ingrata" no trae géneros en el fixture
  })

  it('es idempotente: volver a importar el mismo álbum no duplica artista, álbum, canciones ni géneros', async () => {
    await importAlbumWithTracks(prisma, CAFE_TACVBA, RE_ALBUM_DETAIL)
    const second = await importAlbumWithTracks(prisma, CAFE_TACVBA, RE_ALBUM_DETAIL)

    expect(await prisma.artist.count()).toBe(1)
    expect(await prisma.album.count()).toBe(1)
    expect(await prisma.track.count()).toBe(3)
    expect(second.trackIds).toHaveLength(3)

    // Los géneros compartidos entre artista y álbum ("rock en español") se reutilizan.
    const genreCount = await prisma.genre.count()
    expect(genreCount).toBe(3) // rock en español, alternative rock, ska

    const trackGenreCount = await prisma.trackGenre.count()
    expect(trackGenreCount).toBe(2) // El Aparato -> rock en español, El Borrego -> ska
  })

  it('actualiza los metadatos si el álbum cambió al reimportarlo', async () => {
    await importAlbumWithTracks(prisma, CAFE_TACVBA, RE_ALBUM_DETAIL)

    const updated: CatalogAlbumDetail = {
      ...RE_ALBUM_DETAIL,
      totalTracks: 99,
      tracks: RE_ALBUM_DETAIL.tracks.map((t) =>
        t.sourceId === 'rec-1111-aaaa' ? { ...t, title: 'El Aparato (remasterizado)' } : t,
      ),
    }
    await importAlbumWithTracks(prisma, CAFE_TACVBA, updated)

    const album = await prisma.album.findFirstOrThrow({ where: { mbid: RE_ALBUM_DETAIL.sourceId } })
    expect(album.totalTracks).toBe(99)

    const track = await prisma.track.findFirstOrThrow({ where: { mbid: 'rec-1111-aaaa' } })
    expect(track.title).toBe('El Aparato (remasterizado)')
    expect(await prisma.track.count()).toBe(3)
  })
})
