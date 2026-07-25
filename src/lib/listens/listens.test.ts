import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { listRecentListens, recordListen } from './listens'
import { ListenValidationError } from './validation'
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

async function seedTrack() {
  const artist = await db.artist.create({ data: { name: 'Tame Impala' } })
  const album = await db.album.create({ data: { title: 'Currents', artistId: artist.id } })
  const track = await db.track.create({ data: { title: 'The Less I Know the Better', artistId: artist.id, albumId: album.id } })
  return { artist, album, track }
}

describe('recordListen', () => {
  it('registra una escucha manual', async () => {
    const { track } = await seedTrack()
    const playedAt = new Date('2026-07-01T10:00:00.000Z')

    const listen = await recordListen({ trackId: track.id, playedAt }, db)

    expect(listen.trackId).toBe(track.id)
    expect(listen.source).toBe('MANUAL')
    expect(listen.track.title).toBe(track.title)
    expect(listen.track.artist.name).toBe('Tame Impala')
  })

  it('usa MANUAL y la hora actual como valores por defecto', async () => {
    const { track } = await seedTrack()
    const before = new Date()
    const listen = await recordListen({ trackId: track.id }, db)
    expect(listen.source).toBe('MANUAL')
    expect(listen.playedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
  })

  it('registrar la misma escucha dos veces es idempotente, no truena', async () => {
    const { track } = await seedTrack()
    const playedAt = new Date('2026-07-02T08:30:00.000Z')

    const first = await recordListen({ trackId: track.id, playedAt, source: 'SPOTIFY', msPlayed: 180_000 }, db)
    const second = await recordListen({ trackId: track.id, playedAt, source: 'SPOTIFY', msPlayed: 180_000 }, db)

    expect(second.id).toBe(first.id)
    expect(await db.listen.count({ where: { trackId: track.id } })).toBe(1)
  })

  it('rechaza datos inválidos antes de tocar la base de datos', async () => {
    const before = await db.listen.count()
    await expect(recordListen({ trackId: '' }, db)).rejects.toBeInstanceOf(ListenValidationError)
    expect(await db.listen.count()).toBe(before)
  })

  it('da un mensaje legible si la canción no existe', async () => {
    await expect(recordListen({ trackId: 'no-existe' }, db)).rejects.toThrow('La canción indicada no existe.')
  })
})

describe('listRecentListens', () => {
  it('devuelve una página vacía en una base de datos vacía', async () => {
    const testDb = createTestDb()
    try {
      const page = await listRecentListens({}, testDb.prisma)
      expect(page.items).toEqual([])
      expect(page.total).toBe(0)
      expect(page.totalPages).toBe(0)
    } finally {
      await testDb.cleanup()
    }
  })

  it('pagina el historial ordenado por fecha descendente', async () => {
    const { track } = await seedTrack()
    for (let i = 0; i < 5; i++) {
      await recordListen({ trackId: track.id, playedAt: new Date(2026, 0, i + 1, 12, 0, 0) }, db)
    }

    const page1 = await listRecentListens({ page: 1, pageSize: 2 }, db)
    expect(page1.items).toHaveLength(2)
    expect(page1.total).toBe(5)
    expect(page1.totalPages).toBe(3)
    // Orden descendente: el más reciente (día 5) primero.
    expect(page1.items[0].playedAt.getDate()).toBe(5)

    const page3 = await listRecentListens({ page: 3, pageSize: 2 }, db)
    expect(page3.items).toHaveLength(1)
  })
})
