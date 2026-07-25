import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { ratingToStars, type ReviewInput } from '@/lib/schemas'
import { parseReviewInput } from './validation'

/** Cliente Prisma inyectable: por defecto el singleton de la app, sustituible en pruebas. */
type Db = typeof prisma

// --- Inclusiones compartidas -------------------------------------------------------
// Se resuelven artista/álbum/canción con `include` en la misma consulta para evitar el
// problema N+1 (nunca se hace una consulta extra por fila en un bucle).

const feedInclude = {
  album: { include: { artist: true } },
  track: { include: { artist: true, album: true } },
} satisfies Prisma.ReviewInclude

type ReviewWithTargets = Prisma.ReviewGetPayload<{ include: typeof feedInclude }>

/** Reseña con su objetivo (álbum o canción) ya resuelto, lista para mostrarse. */
export type ReviewFeedItem = {
  id: string
  rating: number
  stars: number
  title: string | null
  body: string | null
  context: string | null
  listenedOn: Date | null
  isFavorite: boolean
  createdAt: Date
  updatedAt: Date
} & (
  | {
      targetType: 'ALBUM'
      album: { id: string; title: string; coverUrl: string | null; albumType: string }
      artist: { id: string; name: string }
      track: null
    }
  | {
      targetType: 'TRACK'
      track: { id: string; title: string }
      album: { id: string; title: string; coverUrl: string | null } | null
      artist: { id: string; name: string }
    }
)

function toFeedItem(review: ReviewWithTargets): ReviewFeedItem {
  const base = {
    id: review.id,
    rating: review.rating,
    stars: ratingToStars(review.rating),
    title: review.title,
    body: review.body,
    context: review.context,
    listenedOn: review.listenedOn,
    isFavorite: review.isFavorite,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  }

  if (review.album) {
    return {
      ...base,
      targetType: 'ALBUM',
      album: {
        id: review.album.id,
        title: review.album.title,
        coverUrl: review.album.coverUrl,
        albumType: review.album.albumType,
      },
      artist: { id: review.album.artist.id, name: review.album.artist.name },
      track: null,
    }
  }

  if (review.track) {
    return {
      ...base,
      targetType: 'TRACK',
      track: { id: review.track.id, title: review.track.title },
      album: review.track.album
        ? { id: review.track.album.id, title: review.track.album.title, coverUrl: review.track.album.coverUrl }
        : null,
      artist: { id: review.track.artist.id, name: review.track.artist.name },
    }
  }

  // Inalcanzable en la práctica: el CHECK de la base de datos garantiza exactamente un
  // objetivo, pero TypeScript no lo sabe.
  throw new Error(`La reseña ${review.id} no tiene álbum ni canción asociados.`)
}

/** Convierte errores conocidos de Prisma en mensajes legibles en español. */
function translatePrismaError(error: unknown, notFoundMessage: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      throw new Error('El álbum o la canción indicados no existen.')
    }
    if (error.code === 'P2025') {
      throw new Error(notFoundMessage)
    }
  }
  throw error
}

/**
 * Crea una reseña. Valida con `reviewInputSchema` antes de tocar la base de datos, así
 * un dato inválido nunca llega al CHECK de SQLite.
 */
export async function createReview(input: unknown, db: Db = prisma): Promise<ReviewFeedItem> {
  const data = parseReviewInput(input)
  try {
    const review = await db.review.create({
      data: {
        albumId: data.albumId,
        trackId: data.trackId,
        rating: data.rating,
        title: data.title,
        body: data.body,
        context: data.context,
        listenedOn: data.listenedOn,
        isFavorite: data.isFavorite,
      },
      include: feedInclude,
    })
    return toFeedItem(review)
  } catch (error) {
    translatePrismaError(error, 'La reseña no existe.')
  }
}

/**
 * Reemplaza una reseña existente. Igual que al crear, exige un `ReviewInput` completo
 * (con objetivo y calificación) para no dejar la fila en un estado a medio validar.
 */
export async function updateReview(id: string, input: unknown, db: Db = prisma): Promise<ReviewFeedItem> {
  const data = parseReviewInput(input)
  try {
    const review = await db.review.update({
      where: { id },
      data: {
        albumId: data.albumId ?? null,
        trackId: data.trackId ?? null,
        rating: data.rating,
        title: data.title,
        body: data.body,
        context: data.context,
        listenedOn: data.listenedOn,
        isFavorite: data.isFavorite,
      },
      include: feedInclude,
    })
    return toFeedItem(review)
  } catch (error) {
    translatePrismaError(error, `No existe una reseña con id "${id}".`)
  }
}

/** Borra una reseña por id. Lanza un error legible si no existe. */
export async function deleteReview(id: string, db: Db = prisma): Promise<void> {
  try {
    await db.review.delete({ where: { id } })
  } catch (error) {
    translatePrismaError(error, `No existe una reseña con id "${id}".`)
  }
}

/** Obtiene una reseña por id, con su objetivo resuelto. */
export async function getReviewById(id: string, db: Db = prisma): Promise<ReviewFeedItem | null> {
  const review = await db.review.findUnique({ where: { id }, include: feedInclude })
  return review ? toFeedItem(review) : null
}

/** Reseña más reciente de un álbum concreto, o `null` si no tiene ninguna. */
export async function getAlbumReview(albumId: string, db: Db = prisma): Promise<ReviewFeedItem | null> {
  const review = await db.review.findFirst({
    where: { albumId },
    orderBy: { createdAt: 'desc' },
    include: feedInclude,
  })
  return review ? toFeedItem(review) : null
}

/** Reseña más reciente de una canción concreta, o `null` si no tiene ninguna. */
export async function getTrackReview(trackId: string, db: Db = prisma): Promise<ReviewFeedItem | null> {
  const review = await db.review.findFirst({
    where: { trackId },
    orderBy: { createdAt: 'desc' },
    include: feedInclude,
  })
  return review ? toFeedItem(review) : null
}

export interface ListRecentReviewsOptions {
  /** Cuántas reseñas devolver como máximo (por defecto 20). */
  limit?: number
  /** Id de la última reseña ya vista, para paginar hacia atrás en el tiempo. */
  cursor?: string
}

export interface ReviewFeedPage {
  items: ReviewFeedItem[]
  /** Cursor a pasar en la siguiente llamada, o `null` si no hay más páginas. */
  nextCursor: string | null
}

/**
 * Feed único de reseñas recientes, mezclando álbumes y canciones, ordenado por fecha de
 * creación descendente. Una sola consulta con `include` resuelve artista/álbum/canción
 * de todas las filas a la vez (sin N+1).
 */
export async function listRecentReviews(
  options: ListRecentReviewsOptions = {},
  db: Db = prisma,
): Promise<ReviewFeedPage> {
  const limit = options.limit ?? 20
  const reviews = await db.review.findMany({
    take: limit + 1,
    ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    include: feedInclude,
  })

  const hasMore = reviews.length > limit
  const page = hasMore ? reviews.slice(0, limit) : reviews
  return {
    items: page.map(toFeedItem),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  }
}

export type { ReviewInput }
