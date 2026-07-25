'use server'

import { redirect } from 'next/navigation'
import { createReview } from '@/lib/reviews'

export interface ValoresFormularioResena {
  tipo: 'ALBUM' | 'TRACK'
  albumId: string
  trackId: string
  rating: string
  title: string
  body: string
  context: string
  listenedOn: string
  isFavorite: boolean
}

export interface EstadoFormularioResena {
  error: string | null
  valores: ValoresFormularioResena
}

export const valoresIniciales: ValoresFormularioResena = {
  tipo: 'ALBUM',
  albumId: '',
  trackId: '',
  rating: '',
  title: '',
  body: '',
  context: '',
  listenedOn: '',
  isFavorite: false,
}

/** Lee un campo de texto y lo convierte a `undefined` si viene vacío, para que los
 * campos opcionales del esquema de validación se traten como "no enviados". */
function textoOIndefinido(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo)
  if (typeof valor !== 'string') return undefined
  const recortado = valor.trim()
  return recortado.length > 0 ? recortado : undefined
}

/**
 * Server Action que crea una reseña a partir del formulario de `/resenas/nueva`.
 *
 * Devuelve el estado del formulario (error + valores ya escritos) en vez de lanzar,
 * así `useActionState` puede volver a mostrar el formulario sin perder lo que el
 * usuario ya había escrito. `redirect()` se llama fuera del `try/catch`: es una
 * excepción especial de Next.js y atraparla por error rompería la navegación.
 */
export async function crearResena(
  _estadoPrevio: EstadoFormularioResena,
  formData: FormData,
): Promise<EstadoFormularioResena> {
  const tipo: 'ALBUM' | 'TRACK' = formData.get('tipo') === 'TRACK' ? 'TRACK' : 'ALBUM'

  const valores: ValoresFormularioResena = {
    tipo,
    albumId: String(formData.get('albumId') ?? ''),
    trackId: String(formData.get('trackId') ?? ''),
    rating: String(formData.get('rating') ?? ''),
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    context: String(formData.get('context') ?? ''),
    listenedOn: String(formData.get('listenedOn') ?? ''),
    isFavorite: formData.get('isFavorite') === 'on',
  }

  try {
    await createReview({
      albumId: tipo === 'ALBUM' ? textoOIndefinido(formData, 'albumId') : undefined,
      trackId: tipo === 'TRACK' ? textoOIndefinido(formData, 'trackId') : undefined,
      rating: textoOIndefinido(formData, 'rating'),
      title: textoOIndefinido(formData, 'title'),
      body: textoOIndefinido(formData, 'body'),
      context: textoOIndefinido(formData, 'context'),
      listenedOn: textoOIndefinido(formData, 'listenedOn'),
      isFavorite: valores.isFavorite,
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo guardar la reseña.',
      valores,
    }
  }

  redirect('/resenas')
}
