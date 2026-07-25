import { z } from 'zod'

// Contrato compartido de la aplicación.
//
// SQLite no tiene enums, así que los conjuntos cerrados de valores se validan aquí.
// Este archivo es la única fuente de verdad: si un valor permitido no está en este
// archivo, no existe.

export const ALBUM_TYPES = ['LP', 'EP', 'SINGLE', 'COMPILATION'] as const
export const albumTypeSchema = z.enum(ALBUM_TYPES)
export type AlbumType = z.infer<typeof albumTypeSchema>

export const LISTEN_SOURCES = ['MANUAL', 'SPOTIFY', 'IMPORT'] as const
export const listenSourceSchema = z.enum(LISTEN_SOURCES)
export type ListenSource = z.infer<typeof listenSourceSchema>

export const GENRE_SOURCES = ['MANUAL', 'MUSICBRAINZ', 'SPOTIFY'] as const
export const genreSourceSchema = z.enum(GENRE_SOURCES)
export type GenreSource = z.infer<typeof genreSourceSchema>

/**
 * Calificación entera de 1 a 10. La interfaz la presenta como 0.5 a 5 estrellas.
 * Guardarla como entero evita errores de redondeo al promediar y ordenar.
 */
// Un campo de formulario sin elegir llega como cadena vacía, y `Number('')` es 0, lo
// que haría saltar el mensaje de "mínimo media estrella" a alguien que simplemente no
// eligió nada. Se convierte a undefined para que el mensaje sea el correcto.
export const ratingSchema = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce
    .number({ error: 'Elige una calificación.' })
  .int({ error: 'La calificación debe ser un número entero.' })
    .min(1, { error: 'La calificación mínima es media estrella.' })
    .max(10, { error: 'La calificación máxima es 5 estrellas.' }),
)

export function ratingToStars(rating: number): number {
  return rating / 2
}

export function starsToRating(stars: number): number {
  return Math.round(stars * 2)
}

/**
 * Una reseña apunta a un álbum o a una canción, nunca a ambos ni a ninguno.
 * La base de datos aplica la misma regla con un CHECK; esta validación existe para dar
 * un mensaje de error legible antes de llegar a ella.
 */
export const reviewInputSchema = z
  .object({
    albumId: z.string().min(1).optional(),
    trackId: z.string().min(1).optional(),
    rating: ratingSchema,
    title: z.string().trim().max(200, { error: 'El título no puede pasar de 200 caracteres.' }).optional(),
    body: z.string().trim().max(20_000, { error: 'La reseña no puede pasar de 20 000 caracteres.' }).optional(),
    context: z.string().trim().max(500, { error: 'El contexto no puede pasar de 500 caracteres.' }).optional(),
    listenedOn: z.coerce.date({ error: 'La fecha de escucha no es válida.' }).optional(),
    isFavorite: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.albumId) !== Boolean(v.trackId), {
    message: 'Una reseña debe apuntar a un álbum o a una canción, pero no a ambos.',
    path: ['albumId'],
  })

export type ReviewInput = z.infer<typeof reviewInputSchema>

export const listenInputSchema = z.object({
  trackId: z.string().min(1),
  playedAt: z.coerce.date().default(() => new Date()),
  source: listenSourceSchema.default('MANUAL'),
  msPlayed: z.number().int().nonnegative().optional(),
})

export type ListenInput = z.infer<typeof listenInputSchema>

export function slugifyGenre(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
