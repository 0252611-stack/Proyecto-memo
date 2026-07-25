'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MusicBrainzCatalogSource } from '@/lib/catalog/musicbrainz'
import { importarDesdeResultado, mensajeErrorCatalogo } from './catalogo-local'

export interface ResultadoImportacion {
  error: string | null
}

/**
 * Crea la fuente de catálogo, o devuelve el motivo por el que no se puede.
 *
 * MusicBrainz exige un User-Agent identificable con un correo de contacto; sin él
 * bloquea las peticiones. Se comprueba aquí para poder mostrar una explicación en vez de
 * dejar que reviente en medio de una búsqueda.
 */
export async function crearFuenteCatalogo(): Promise<
  { fuente: MusicBrainzCatalogSource; error: null } | { fuente: null; error: string }
> {
  const userAgent = process.env.MUSICBRAINZ_USER_AGENT
  if (!userAgent || userAgent.trim().length === 0) {
    return {
      fuente: null,
      error:
        'Falta configurar MUSICBRAINZ_USER_AGENT en tu archivo .env. MusicBrainz exige ' +
        'identificarse con un nombre de aplicación y un correo de contacto, por ejemplo: ' +
        'Memo/0.1 ( tu-correo@ejemplo.com )',
    }
  }
  return { fuente: new MusicBrainzCatalogSource({ userAgent }), error: null }
}

/** Importa un álbum de MusicBrainz al catálogo local y lleva a su ficha. */
export async function importarAlbum(
  _anterior: ResultadoImportacion | null,
  datos: FormData,
): Promise<ResultadoImportacion> {
  const sourceId = datos.get('sourceId')
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { error: 'No se pudo identificar el álbum a importar.' }
  }

  const { fuente, error } = await crearFuenteCatalogo()
  if (!fuente) return { error }

  let albumId: string
  try {
    albumId = await importarDesdeResultado(sourceId, fuente)
  } catch (e) {
    return { error: mensajeErrorCatalogo(e) }
  }

  revalidatePath('/catalogo')
  revalidatePath('/')

  // `redirect` lanza una excepción especial que Next.js intercepta, por eso va fuera
  // del try: dentro, el catch la trataría como un fallo de importación.
  redirect(`/catalogo/album/${albumId}`)
}
