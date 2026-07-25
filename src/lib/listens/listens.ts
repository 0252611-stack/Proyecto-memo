import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { parseListenInput } from './validation'

type Db = typeof prisma

const listenInclude = {
  track: { include: { artist: true, album: true } },
} satisfies Prisma.ListenInclude

export type ListenWithTrack = Prisma.ListenGetPayload<{ include: typeof listenInclude }>

/**
 * Registra una escucha manual, validando con `listenInputSchema`.
 *
 * La tabla tiene un UNIQUE sobre `(trackId, playedAt)` pensado para que sincronizar el
 * historial de Spotify sea idempotente. Aquí se usa `upsert` en vez de `create` para
 * que registrar la misma escucha dos veces no truene con un error de constraint: la
 * segunda llamada simplemente devuelve la fila ya existente.
 */
export async function recordListen(input: unknown, db: Db = prisma): Promise<ListenWithTrack> {
  const data = parseListenInput(input)
  try {
    return await db.listen.upsert({
      where: { trackId_playedAt: { trackId: data.trackId, playedAt: data.playedAt } },
      update: {}, // Ya existe: no hay nada que cambiar, sólo confirmar que quedó registrada.
      create: {
        trackId: data.trackId,
        playedAt: data.playedAt,
        source: data.source,
        msPlayed: data.msPlayed,
      },
      include: listenInclude,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new Error('La canción indicada no existe.')
    }
    throw error
  }
}

export interface ListRecentListensOptions {
  /** Página a devolver, empezando en 1 (por defecto 1). */
  page?: number
  /** Tamaño de página (por defecto 20). */
  pageSize?: number
}

export interface ListensPage {
  items: ListenWithTrack[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * Historial de escuchas más recientes, paginado. Resuelve canción/álbum/artista con
 * `include` en la misma consulta.
 */
export async function listRecentListens(
  options: ListRecentListensOptions = {},
  db: Db = prisma,
): Promise<ListensPage> {
  const page = Math.max(1, Math.trunc(options.page ?? 1))
  const pageSize = Math.max(1, Math.trunc(options.pageSize ?? 20))

  const [items, total] = await Promise.all([
    db.listen.findMany({
      orderBy: { playedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: listenInclude,
    }),
    db.listen.count(),
  ])

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}
