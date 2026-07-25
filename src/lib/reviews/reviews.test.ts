import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import {
  createReview,
  deleteReview,
  getAlbumReview,
  getReviewById,
  getTrackReview,
  listRecentReviews,
  updateReview,
} from './reviews'
import { ReviewValidationError } from './validation'
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

// Cada prueba parte de una base de datos vacía, aunque todas comparten el mismo
// archivo SQLite migrado (crear uno nuevo por prueba sería mucho más lento).
afterEach(async () => {
  await resetDb(db)
})

async function seedCatalog() {
  const artist = await db.artist.create({ data: { name: 'Björk' } })
  const album = await db.album.create({ data: { title: 'Homogenic', artistId: artist.id, albumType: 'LP' } })
  const track = await db.track.create({ data: { title: 'Jóga', artistId: artist.id, albumId: album.id } })
  return { artist, album, track }
}

describe('createReview', () => {
  it('crea una reseña de álbum y resuelve artista/álbum en la respuesta', async () => {
    const { artist, album } = await seedCatalog()
    const review = await createReview({ albumId: album.id, rating: 9, title: 'Un clásico' }, db)

    expect(review.targetType).toBe('ALBUM')
    expect(review.rating).toBe(9)
    expect(review.stars).toBe(4.5)
    if (review.targetType === 'ALBUM') {
      expect(review.album.title).toBe('Homogenic')
      expect(review.artist.name).toBe(artist.name)
    }
  })

  it('crea una reseña de canción y resuelve artista/álbum/canción', async () => {
    const { track } = await seedCatalog()
    const review = await createReview({ trackId: track.id, rating: 10 }, db)

    expect(review.targetType).toBe('TRACK')
    if (review.targetType === 'TRACK') {
      expect(review.track.title).toBe('Jóga')
      expect(review.album?.title).toBe('Homogenic')
    }
  })

  it('rechaza una reseña con álbum y canción a la vez, sin tocar la base de datos', async () => {
    const { album, track } = await seedCatalog()
    const before = await db.review.count()

    await expect(createReview({ albumId: album.id, trackId: track.id, rating: 8 }, db)).rejects.toBeInstanceOf(
      ReviewValidationError,
    )

    expect(await db.review.count()).toBe(before)
  })

  it('rechaza una reseña sin objetivo', async () => {
    await expect(createReview({ rating: 8 }, db)).rejects.toBeInstanceOf(ReviewValidationError)
  })

  it('rechaza calificaciones fuera de 1..10 antes de llegar al CHECK de la base de datos', async () => {
    const { album } = await seedCatalog()
    await expect(createReview({ albumId: album.id, rating: 0 }, db)).rejects.toBeInstanceOf(ReviewValidationError)
    await expect(createReview({ albumId: album.id, rating: 11 }, db)).rejects.toBeInstanceOf(ReviewValidationError)
  })

  it('da un mensaje legible si el álbum/canción referido no existe', async () => {
    await expect(createReview({ albumId: 'no-existe', rating: 8 }, db)).rejects.toThrow(
      'El álbum o la canción indicados no existen.',
    )
  })
})

describe('getAlbumReview / getTrackReview', () => {
  it('devuelve null cuando no hay reseña', async () => {
    const { album, track } = await seedCatalog()
    expect(await getAlbumReview(album.id, db)).toBeNull()
    expect(await getTrackReview(track.id, db)).toBeNull()
  })

  it('devuelve la reseña más reciente del álbum/canción', async () => {
    const { album, track } = await seedCatalog()
    await createReview({ albumId: album.id, rating: 6, title: 'primera pasada' }, db)
    await new Promise((r) => setTimeout(r, 2))
    const segunda = await createReview({ albumId: album.id, rating: 9, title: 'segunda pasada' }, db)

    const found = await getAlbumReview(album.id, db)
    expect(found?.id).toBe(segunda.id)
    expect(found?.title).toBe('segunda pasada')

    expect(await getTrackReview(track.id, db)).toBeNull()
  })
})

describe('updateReview / deleteReview', () => {
  it('actualiza una reseña existente', async () => {
    const { album } = await seedCatalog()
    const created = await createReview({ albumId: album.id, rating: 5 }, db)

    const updated = await updateReview(created.id, { albumId: album.id, rating: 8, body: 'mejoró con el tiempo' }, db)

    expect(updated.rating).toBe(8)
    expect(updated.body).toBe('mejoró con el tiempo')
  })

  it('da un mensaje legible al actualizar una reseña inexistente', async () => {
    const { album } = await seedCatalog()
    await expect(updateReview('no-existe', { albumId: album.id, rating: 5 }, db)).rejects.toThrow(
      'No existe una reseña con id "no-existe".',
    )
  })

  it('borra una reseña', async () => {
    const { album } = await seedCatalog()
    const created = await createReview({ albumId: album.id, rating: 7 }, db)
    await deleteReview(created.id, db)
    expect(await getReviewById(created.id, db)).toBeNull()
  })

  it('da un mensaje legible al borrar una reseña inexistente', async () => {
    await expect(deleteReview('no-existe', db)).rejects.toThrow('No existe una reseña con id "no-existe".')
  })
})

describe('listRecentReviews', () => {
  it('mezcla reseñas de álbum y de canción en un solo feed, ordenado por fecha', async () => {
    const { album, track } = await seedCatalog()
    const albumReview = await createReview({ albumId: album.id, rating: 7 }, db)
    await new Promise((r) => setTimeout(r, 2))
    const trackReview = await createReview({ trackId: track.id, rating: 9 }, db)

    const { items } = await listRecentReviews({}, db)

    expect(items.map((i) => i.id)).toEqual([trackReview.id, albumReview.id])
    expect(items[0].targetType).toBe('TRACK')
    expect(items[1].targetType).toBe('ALBUM')
    // Los datos del artista ya vienen resueltos, sin consultas adicionales por fila.
    expect(items[0].artist.name).toBe('Björk')
    expect(items[1].artist.name).toBe('Björk')
  })

  it('devuelve una lista vacía cuando no hay reseñas', async () => {
    const { items, nextCursor } = await listRecentReviews({}, db)
    expect(items).toEqual([])
    expect(nextCursor).toBeNull()
  })

  it('pagina con cursor', async () => {
    const { artist } = await seedCatalog()
    for (let i = 0; i < 3; i++) {
      const album = await db.album.create({ data: { title: `Álbum ${i}`, artistId: artist.id } })
      await createReview({ albumId: album.id, rating: 5 + i }, db)
      await new Promise((r) => setTimeout(r, 2))
    }

    const firstPage = await listRecentReviews({ limit: 2 }, db)
    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.nextCursor).not.toBeNull()

    const secondPage = await listRecentReviews({ limit: 2, cursor: firstPage.nextCursor! }, db)
    expect(secondPage.items.length).toBeGreaterThan(0)
    // No debe repetirse ningún id entre páginas.
    const firstIds = new Set(firstPage.items.map((i) => i.id))
    for (const item of secondPage.items) expect(firstIds.has(item.id)).toBe(false)
  })
})
