import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { genreDistribution, getTotals, monthlyActivity, topAlbums, topArtists, topTracks } from './stats'
import { createTestDb, resetDb } from './test-db'

let db: PrismaClient
let cleanup: () => Promise<void>

beforeAll(() => {
  const testDb = createTestDb()
  db = testDb.prisma
  cleanup = testDb.cleanup
})

afterAll(async () => {
  await cleanup()
})

afterEach(async () => {
  await resetDb(db)
})

describe('con base de datos vacía', () => {
  it('todas las estadísticas devuelven listas vacías o ceros, sin tronar', async () => {
    expect(await topArtists({}, 10, db)).toEqual([])
    expect(await topAlbums({}, 10, db)).toEqual([])
    expect(await topTracks({}, 10, db)).toEqual([])
    expect(await genreDistribution({}, db)).toEqual([])
    expect(await monthlyActivity({}, db)).toEqual([])

    const totals = await getTotals({}, db)
    expect(totals).toEqual({
      totalListens: 0,
      distinctArtists: 0,
      totalReviews: 0,
      averageRating: null,
      averageStars: null,
    })
  })
})

describe('con datos', () => {
  async function seed() {
    const artist1 = await db.artist.create({ data: { name: 'Daft Punk' } })
    const artist2 = await db.artist.create({ data: { name: 'Justice' } })

    const album1 = await db.album.create({ data: { title: 'Discovery', artistId: artist1.id } })
    const album2 = await db.album.create({ data: { title: 'Cross', artistId: artist2.id } })

    const genreElectro = await db.genre.create({ data: { name: 'Electro', slug: 'electro' } })
    const genreFrenchHouse = await db.genre.create({ data: { name: 'French House', slug: 'french-house' } })
    await db.albumGenre.create({ data: { albumId: album1.id, genreId: genreElectro.id } })
    await db.albumGenre.create({ data: { albumId: album2.id, genreId: genreElectro.id } })

    const track1 = await db.track.create({ data: { title: 'One More Time', artistId: artist1.id, albumId: album1.id } })
    const track2 = await db.track.create({ data: { title: 'Harder Better Faster Stronger', artistId: artist1.id, albumId: album1.id } })
    const track3 = await db.track.create({ data: { title: 'Genesis', artistId: artist2.id, albumId: album2.id } })
    // Esta canción sí tiene género propio, distinto al del álbum.
    await db.trackGenre.create({ data: { trackId: track3.id, genreId: genreFrenchHouse.id } })

    // track1: 3 escuchas, track2: 1 escucha, track3: 2 escuchas.
    const plays: Array<[string, Date]> = [
      [track1.id, new Date('2026-01-05T10:00:00.000Z')],
      [track1.id, new Date('2026-01-10T10:00:00.000Z')],
      [track1.id, new Date('2026-02-01T10:00:00.000Z')],
      [track2.id, new Date('2026-01-20T10:00:00.000Z')],
      [track3.id, new Date('2026-02-15T10:00:00.000Z')],
      [track3.id, new Date('2026-03-01T10:00:00.000Z')],
    ]
    for (const [trackId, playedAt] of plays) {
      await db.listen.create({ data: { trackId, playedAt } })
    }

    await db.review.create({ data: { albumId: album1.id, rating: 8 } })
    await db.review.create({ data: { albumId: album2.id, rating: 6 } })

    return { artist1, artist2, album1, album2, track1, track2, track3 }
  }

  it('topArtists cuenta escuchas por artista, de mayor a menor', async () => {
    const { artist1, artist2 } = await seed()
    const stats = await topArtists({}, 10, db)
    expect(stats[0]).toMatchObject({ artistId: artist1.id, listenCount: 4 })
    expect(stats[1]).toMatchObject({ artistId: artist2.id, listenCount: 2 })
  })

  it('topAlbums cuenta escuchas por álbum', async () => {
    const { album1 } = await seed()
    const stats = await topAlbums({}, 10, db)
    expect(stats[0]).toMatchObject({ albumId: album1.id, listenCount: 4 })
  })

  it('topTracks cuenta escuchas por canción y respeta el límite', async () => {
    const { track1 } = await seed()
    const stats = await topTracks({}, 1, db)
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({ trackId: track1.id, listenCount: 3 })
  })

  it('acota por rango de fechas', async () => {
    await seed()
    const stats = await topArtists({ from: new Date('2026-02-01T00:00:00.000Z') }, 10, db)
    // Sólo cuentan las escuchas de febrero en adelante: track1 (1) y track3 (2).
    const total = stats.reduce((sum, s) => sum + s.listenCount, 0)
    expect(total).toBe(3)
  })

  it('genreDistribution usa el género de la canción si lo tiene, o si no el del álbum', async () => {
    await seed()
    const stats = await genreDistribution({}, db)
    const electro = stats.find((s) => s.genreName === 'Electro')
    const frenchHouse = stats.find((s) => s.genreName === 'French House')

    // Electro: escuchas de track1 (3) + track2 (1) heredan el género del álbum 1.
    expect(electro?.listenCount).toBe(4)
    // French House: las 2 escuchas de track3, que tiene género propio (no hereda Electro).
    expect(frenchHouse?.listenCount).toBe(2)
  })

  it('monthlyActivity agrupa por mes', async () => {
    await seed()
    const stats = await monthlyActivity({}, db)
    expect(stats).toEqual([
      { month: '2026-01', listenCount: 3 },
      { month: '2026-02', listenCount: 2 },
      { month: '2026-03', listenCount: 1 },
    ])
  })

  it('getTotals combina escuchas, artistas distintos, reseñas y calificación promedio', async () => {
    await seed()
    const totals = await getTotals({}, db)
    expect(totals.totalListens).toBe(6)
    expect(totals.distinctArtists).toBe(2)
    expect(totals.totalReviews).toBe(2)
    expect(totals.averageRating).toBe(7)
    expect(totals.averageStars).toBe(3.5)
  })
})
