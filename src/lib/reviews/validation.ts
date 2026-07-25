import { reviewInputSchema, type ReviewInput } from '@/lib/schemas'

/**
 * Error de validación de una reseña.
 *
 * Se lanza ANTES de tocar la base de datos, así el CHECK de SQLite
 * (`Review_exactly_one_target` / `Review_rating_range`, ver la migración
 * `20260725201922_review_target_check`) nunca debería dispararse en uso normal: esta
 * capa ya rechazó el dato con un mensaje legible en español.
 */
export class ReviewValidationError extends Error {
  readonly issues: { path: (string | number)[]; message: string }[]

  constructor(issues: { path: (string | number)[]; message: string }[]) {
    super(issues.map((issue) => issue.message).join('; ') || 'Reseña inválida.')
    this.name = 'ReviewValidationError'
    this.issues = issues
  }
}

/** Valida datos crudos de reseña con `reviewInputSchema` o lanza `ReviewValidationError`. */
export function parseReviewInput(input: unknown): ReviewInput {
  const result = reviewInputSchema.safeParse(input)
  if (!result.success) {
    throw new ReviewValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path as (string | number)[],
        message: issue.message,
      })),
    )
  }
  return result.data
}
