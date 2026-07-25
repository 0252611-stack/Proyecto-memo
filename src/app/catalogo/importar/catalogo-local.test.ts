import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { MusicBrainzNotFoundError, MusicBrainzRateLimitError } from '@/lib/catalog/musicbrainz'
import type { CatalogAlbum, CatalogAlbumDetail, MusicCatalogSource } from '@/lib/catalog/types'
import { buscarEnCatalogo, importarDesdeResultado, mensajeErrorCatalogo } from './catalogo-local'

// El entorno bloquea musicbrainz.org, así que el camino exitoso se verifica con una
// fuente falsa que implementa MusicCatalogSource. Es exactamente el motivo por el que la
// interfaz existe: la aplicación no depende del proveedor, sólo de esta forma.

const DB_PATH = join(process.cwd(), 'src/app/catalogo/importar/.importar-test.db')
const MIGRATIONS_DIR = join(process.cwd(), 'prisma/migrations')

function limpiarArchivos() {
  for (const sufijo of ['', '-shm', '-wal']) {
    const p = DB_PATH + sufijo
    if (existsSync(p)) rmSync(p)
  }
}

const ALBUM: CatalogAlbum = {
  sourceId: 'mb-album-1',
  title: 'Kid A',
  artistSourceId: 'mb-artist-1',
  artistName: 'Radiohead',
  albumType: 'LP',
  releaseDate: '2000-10-02',
  totalTracks: 2,
  genres: ['electronic', 'art rock'],
}

const DETALLE: CatalogAlbumDetail = {
  ...ALBUM,
  tracks: [
    { sourceId: 'mb-track-1', title: 'Everything in Its Right Place', trackNumber: 1, genres: [] },
    { sourceId: 'mb-track-2', title: 'Kid A', trackNumber: 2, genres: [] },
  ],
}

/** Fuente de catálogo falsa: responde desde memoria, nunca sale a la red. */
function fuenteFalsa(overrides: Partial<MusicCatalogSource> = {}): MusicCatalogSource {
  return {
    searchArtists: async () => [],
    searchAlbums: async () => [ALBUM],
    getAlbumDetail: async (id) => (id === ALBUM.sourceId ? DETALLE : null),
    ...overrides,
  }
}

let prisma: PrismaClient

beforeAll(() => {
  limpiarArchivos()
  const raw = new Database(DB_PATH)
  for (const dir of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    raw.exec(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
  }
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

describe('buscarEnCatalogo', () => {
  it('marca como no importado lo que no está en la base', async () => {
    const resultados = await buscarEnCatalogo('kid a', fuenteFalsa(), prisma)
    expect(resultados).toHaveLength(1)
    expect(resultados[0].albumIdLocal).toBeNull()
  })

  it('marca con su id local lo que ya está importado', async () => {
    const albumId = await importarDesdeResultado(ALBUM.sourceId, fuenteFalsa(), prisma)
    const resultados = await buscarEnCatalogo('kid a', fuenteFalsa(), prisma)
    expect(resultados[0].albumIdLocal).toBe(albumId)
  })

  it('no consulta la base si la búsqueda no devuelve nada', async () => {
    const resultados = await buscarEnCatalogo(
      'nada',
      fuenteFalsa({ searchAlbums: async () => [] }),
      prisma,
    )
    expect(resultados).toEqual([])
  })
})

describe('importarDesdeResultado', () => {
  it('importa el álbum con su artista, sus canciones y sus géneros', async () => {
    const albumId = await importarDesdeResultado(ALBUM.sourceId, fuenteFalsa(), prisma)

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: { artist: true, tracks: true, genres: { include: { genre: true } } },
    })
    expect(album?.title).toBe('Kid A')
    expect(album?.artist.name).toBe('Radiohead')
    expect(album?.tracks).toHaveLength(2)
    expect(album?.genres.map((g) => g.genre.name).sort()).toEqual(['art rock', 'electronic'])
  })

  it('importar dos veces no duplica nada', async () => {
    const primero = await importarDesdeResultado(ALBUM.sourceId, fuenteFalsa(), prisma)
    const segundo = await importarDesdeResultado(ALBUM.sourceId, fuenteFalsa(), prisma)

    expect(segundo).toBe(primero)
    expect(await prisma.album.count()).toBe(1)
    expect(await prisma.artist.count()).toBe(1)
    expect(await prisma.track.count()).toBe(2)
  })

  it('lanza si el álbum no existe en la fuente', async () => {
    await expect(
      importarDesdeResultado('no-existe', fuenteFalsa(), prisma),
    ).rejects.toBeInstanceOf(MusicBrainzNotFoundError)
  })
})

describe('mensajeErrorCatalogo', () => {
  it('explica el límite de peticiones en español', () => {
    const mensaje = mensajeErrorCatalogo(new MusicBrainzRateLimitError('/release', 3))
    expect(mensaje).toContain('una por segundo')
  })

  it('nunca devuelve el mensaje crudo de un error desconocido', () => {
    const mensaje = mensajeErrorCatalogo(new Error('ECONNREFUSED 127.0.0.1:443'))
    expect(mensaje).not.toContain('ECONNREFUSED')
    expect(mensaje).toContain('MusicBrainz')
  })
})
