import { describe, expect, it } from 'vitest'
import { ratingToStars, reviewInputSchema, slugifyGenre, starsToRating } from './schemas'

describe('reviewInputSchema', () => {
  it('acepta una reseña de álbum', () => {
    expect(reviewInputSchema.safeParse({ albumId: 'a1', rating: 8 }).success).toBe(true)
  })
  it('rechaza una reseña con álbum y canción a la vez', () => {
    expect(reviewInputSchema.safeParse({ albumId: 'a1', trackId: 't1', rating: 8 }).success).toBe(false)
  })
  it('rechaza una reseña sin objetivo', () => {
    expect(reviewInputSchema.safeParse({ rating: 8 }).success).toBe(false)
  })
  it('rechaza calificaciones fuera de 1..10', () => {
    expect(reviewInputSchema.safeParse({ albumId: 'a1', rating: 0 }).success).toBe(false)
    expect(reviewInputSchema.safeParse({ albumId: 'a1', rating: 11 }).success).toBe(false)
  })
})

describe('conversión de calificación', () => {
  it('va y vuelve entre enteros y estrellas', () => {
    for (let r = 1; r <= 10; r++) expect(starsToRating(ratingToStars(r))).toBe(r)
  })
})

describe('slugifyGenre', () => {
  it('quita acentos y normaliza', () => {
    expect(slugifyGenre('Rock en Español')).toBe('rock-en-espanol')
    expect(slugifyGenre('  Hip-Hop / Rap ')).toBe('hip-hop-rap')
  })
})
