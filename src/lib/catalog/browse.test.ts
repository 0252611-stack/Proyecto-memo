import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { listarAlbums, listarArtistas, listarGeneros, obtenerAlbum } from './browse'

// Igual que import.test.ts: base SQLite temporal con las migraciones reales del
// proyecto, sin red de por medio.

const DB_PATH = join(process.cwd(), 'src/lib/catalog/__fixtures__/.browse-test.db')
const MIGRATIONS_DIR = join(process.cwd(), 'prisma/migrations')

function aplicarMigraciones(db: Database) {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  for (const dir of dirs) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
  }
}

function limpiarArchivos() {
  for (const sufijo of ['', '-shm', '-wal']) {
    const p = DB_PATH + sufijo
    if (existsSync(p)) rmSync(p)
  }
}

let prisma: PrismaClient

beforeAll(() => {
  limpiarArchivos()
  const raw = new Database(DB_PATH)
  aplicarMigraciones(raw)
  raw.close()
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${DB_PATH}` }) })
})

afterAll(async () => {
  await prisma.$disconnect()
  limpiarArchivos()
})

beforeEach(async () => {
  await prisma.$transaction([
    prisma.review.deleteMany(),
    prisma.listen.deleteMany(),
    prisma.trackGenre.deleteMany(),
    prisma.albumGenre.deleteMany(),
    prisma.artistGenre.deleteMany(),
    prisma.track.deleteMany(),
    prisma.album.deleteMany(),
    prisma.genre.deleteMany(),
    prisma.artist.deleteMany(),
  ])
})

async function sembrar() {
  const rock = await prisma.genre.create({
    data: { name: 'Rock en Español', slug: 'rock-en-espanol' },
  })
  const electronica = await prisma.genre.create({
    data: { name: 'Electrónica', slug: 'electronica' },
  })

  const tacvba = await prisma.artist.create({
    data: { name: 'Café Tacvba', genres: { create: [{ genreId: rock.id }] } },
  })
  const daft = await prisma.artist.create({
    data: { name: 'Daft Punk', genres: { create: [{ genreId: electronica.id }] } },
  })

  const re = await prisma.album.create({
    data: {
      title: 'Re',
      artistId: tacvba.id,
      albumType: 'LP',
      releaseDate: new Date('1994-07-01'),
      genres: { create: [{ genreId: rock.id }] },
    },
  })
  await prisma.album.create({
    data: {
      title: 'Discovery',
      artistId: daft.id,
      albumType: 'LP',
      releaseDate: new Date('2001-03-12'),
      genres: { create: [{ genreId: electronica.id }] },
    },
  })

  const cancion = await prisma.track.create({
    data: { title: 'La Ingrata', artistId: tacvba.id, albumId: re.id, trackNumber: 2 },
  })
  await prisma.listen.create({
    data: { trackId: cancion.id, playedAt: new Date('2026-07-01T10:00:00Z') },
  })
  await prisma.listen.create({
    data: { trackId: cancion.id, playedAt: new Date('2026-07-02T10:00:00Z') },
  })
  await prisma.review.create({ data: { albumId: re.id, rating: 9 } })

  return { rock, electronica, tacvba, daft, re, cancion }
}

describe('listarGeneros', () => {
  it('devuelve los géneros con sus conteos', async () => {
    await sembrar()
    const generos = await listarGeneros(prisma)
    expect(generos).toHaveLength(2)
    expect(generos.every((g) => g.totalArtistas === 1 && g.totalAlbums === 1)).toBe(true)
  })

  it('devuelve una lista vacía cuando no hay nada', async () => {
    expect(await listarGeneros(prisma)).toEqual([])
  })
})

describe('listarArtistas', () => {
  it('incluye géneros, conteo de álbumes y conteo de escuchas', async () => {
    await sembrar()
    const artistas = await listarArtistas({}, prisma)
    const tacvba = artistas.find((a) => a.name === 'Café Tacvba')
    expect(tacvba?.generos.map((g) => g.name)).toEqual(['Rock en Español'])
    expect(tacvba?.totalAlbums).toBe(1)
    expect(tacvba?.totalEscuchas).toBe(2)
  })

  it('pone en cero a los artistas sin escuchas en lugar de omitirlos', async () => {
    await sembrar()
    const artistas = await listarArtistas({}, prisma)
    expect(artistas.find((a) => a.name === 'Daft Punk')?.totalEscuchas).toBe(0)
  })

  it('filtra por género', async () => {
    await sembrar()
    const artistas = await listarArtistas({ generoSlug: 'electronica' }, prisma)
    expect(artistas.map((a) => a.name)).toEqual(['Daft Punk'])
  })

  it('filtra por texto', async () => {
    await sembrar()
    const artistas = await listarArtistas({ busqueda: 'Tacvba' }, prisma)
    expect(artistas.map((a) => a.name)).toEqual(['Café Tacvba'])
  })

  it('encuentra sin importar acentos ni mayúsculas', async () => {
    await sembrar()
    for (const termino of ['cafe', 'CAFÉ', 'café tacvba', 'Cafe Tacvba']) {
      const artistas = await listarArtistas({ busqueda: termino }, prisma)
      expect(artistas.map((a) => a.name), `buscando "${termino}"`).toEqual(['Café Tacvba'])
    }
  })
})

describe('listarAlbums', () => {
  it('ordena del más reciente al más antiguo y calcula la calificación', async () => {
    await sembrar()
    const albums = await listarAlbums({}, prisma)
    expect(albums.map((a) => a.title)).toEqual(['Discovery', 'Re'])
    expect(albums.find((a) => a.title === 'Re')?.rating).toBe(9)
    expect(albums.find((a) => a.title === 'Discovery')?.rating).toBeNull()
  })

  it('filtra por artista', async () => {
    const { daft } = await sembrar()
    const albums = await listarAlbums({ artistaId: daft.id }, prisma)
    expect(albums.map((a) => a.title)).toEqual(['Discovery'])
  })

  it('busca por nombre de artista, no sólo por título del álbum', async () => {
    await sembrar()
    // "Re" no contiene "Tacvba", pero es su disco: buscar al artista debe traerlo.
    const albums = await listarAlbums({ busqueda: 'Tacvba' }, prisma)
    expect(albums.map((a) => a.title)).toEqual(['Re'])
  })

  it('busca sin importar acentos', async () => {
    await sembrar()
    const albums = await listarAlbums({ busqueda: 'cafe' }, prisma)
    expect(albums.map((a) => a.title)).toEqual(['Re'])
  })

  it('busca también por título', async () => {
    await sembrar()
    const albums = await listarAlbums({ busqueda: 'discovery' }, prisma)
    expect(albums.map((a) => a.title)).toEqual(['Discovery'])
  })
})

describe('obtenerAlbum', () => {
  it('trae las canciones ordenadas por número de pista', async () => {
    const { re } = await sembrar()
    const album = await obtenerAlbum(re.id, prisma)
    expect(album?.tracks.map((t) => t.title)).toEqual(['La Ingrata'])
  })

  it('devuelve null si el álbum no existe', async () => {
    expect(await obtenerAlbum('no-existe', prisma)).toBeNull()
  })
})
