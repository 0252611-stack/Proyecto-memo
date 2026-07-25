import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { createReview } from './reviews'
import { averageRatingByArtist, averageRatingByGenre } from './ratings'
import { createTestDb } from './test-db'

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

describe('averageRatingByArtist', () => {
  it('calcula el promedio combinando reseñas de álbum y de canción del mismo artista', async () => {
    const artist = await db.artist.create({ data: { name: 'Grimes' } })
    const album = await db.album.create({ data: { title: 'Visions', artistId: artist.id } })
    const track = await db.track.create({ data: { title: 'Oblivion', artistId: artist.id, albumId: album.id } })

    await createReview({ albumId: album.id, rating: 8 }, db)
    await createReview({ trackId: track.id, rating: 10 }, db)

    const stats = await averageRatingByArtist(artist.id, db)
    expect(stats).toHaveLength(1)
    expect(stats[0].artistName).toBe('Grimes')
    expect(stats[0].reviewCount).toBe(2)
    expect(stats[0].averageRating).toBe(9)
    expect(stats[0].averageStars).toBe(4.5)
  })

  it('devuelve una lista vacía si el artista no tiene reseñas', async () => {
    const artist = await db.artist.create({ data: { name: 'Sin reseñas' } })
    const stats = await averageRatingByArtist(artist.id, db)
    expect(stats).toEqual([])
  })

  it('sin filtro, agrupa por todos los artistas con reseñas', async () => {
    const testDb = createTestDb()
    try {
      const a1 = await testDb.prisma.artist.create({ data: { name: 'Artista 1' } })
      const a2 = await testDb.prisma.artist.create({ data: { name: 'Artista 2' } })
      const album1 = await testDb.prisma.album.create({ data: { title: 'Álbum 1', artistId: a1.id } })
      const album2 = await testDb.prisma.album.create({ data: { title: 'Álbum 2', artistId: a2.id } })
      await createReview({ albumId: album1.id, rating: 4 }, testDb.prisma)
      await createReview({ albumId: album2.id, rating: 10 }, testDb.prisma)

      const stats = await averageRatingByArtist(undefined, testDb.prisma)
      expect(stats).toHaveLength(2)
      expect(stats[0].averageRating).toBe(10) // ordenado descendente
    } finally {
      await testDb.cleanup()
    }
  })
})

describe('averageRatingByGenre', () => {
  it('reparte una reseña entre todos los géneros del álbum/canción reseñado', async () => {
    const artist = await db.artist.create({ data: { name: 'Radiohead' } })
    const album = await db.album.create({ data: { title: 'In Rainbows', artistId: artist.id } })
    const rock = await db.genre.create({ data: { name: 'Rock experimental', slug: 'rock-experimental' } })
    const electronica = await db.genre.create({ data: { name: 'Electrónica', slug: 'electronica' } })
    await db.albumGenre.create({ data: { albumId: album.id, genreId: rock.id } })
    await db.albumGenre.create({ data: { albumId: album.id, genreId: electronica.id } })

    await createReview({ albumId: album.id, rating: 9 }, db)

    const rockStats = await averageRatingByGenre(rock.id, db)
    const electronicaStats = await averageRatingByGenre(electronica.id, db)
    expect(rockStats[0].reviewCount).toBe(1)
    expect(rockStats[0].averageRating).toBe(9)
    expect(electronicaStats[0].averageRating).toBe(9)
  })

  it('devuelve una lista vacía en una base de datos vacía', async () => {
    const testDb = createTestDb()
    try {
      expect(await averageRatingByGenre(undefined, testDb.prisma)).toEqual([])
    } finally {
      await testDb.cleanup()
    }
  })
})
