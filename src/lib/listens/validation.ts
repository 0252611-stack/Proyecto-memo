import { listenInputSchema, type ListenInput } from '@/lib/schemas'

/** Error de validación de una escucha, lanzado ANTES de tocar la base de datos. */
export class ListenValidationError extends Error {
  readonly issues: { path: (string | number)[]; message: string }[]

  constructor(issues: { path: (string | number)[]; message: string }[]) {
    super(issues.map((issue) => issue.message).join('; ') || 'Escucha inválida.')
    this.name = 'ListenValidationError'
    this.issues = issues
  }
}

/** Valida datos crudos de escucha con `listenInputSchema` o lanza `ListenValidationError`. */
export function parseListenInput(input: unknown): ListenInput {
  const result = listenInputSchema.safeParse(input)
  if (!result.success) {
    throw new ListenValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path as (string | number)[],
        message: issue.message,
      })),
    )
  }
  return result.data
}
