'use server'

import { revalidatePath } from 'next/cache'
import { recordListen } from '@/lib/listens'

export interface ResultadoEscucha {
  ok: boolean
  mensaje: string
}

/**
 * Registra que acabas de escuchar una canción.
 *
 * `recordListen` es idempotente sobre (trackId, playedAt), pero aquí la fecha es el
 * instante actual, así que dos pulsaciones seguidas crean dos escuchas distintas. Es el
 * comportamiento correcto: si escuchaste la canción dos veces, son dos escuchas.
 */
export async function registrarEscucha(
  _anterior: ResultadoEscucha | null,
  datos: FormData,
): Promise<ResultadoEscucha> {
  const trackId = datos.get('trackId')
  const titulo = String(datos.get('titulo') ?? 'la canción')

  if (typeof trackId !== 'string' || trackId.length === 0) {
    return { ok: false, mensaje: 'No se pudo identificar la canción.' }
  }

  try {
    await recordListen({ trackId, playedAt: new Date(), source: 'MANUAL' })
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No se pudo registrar la escucha.',
    }
  }

  // El conteo de escuchas aparece en la ficha del álbum, en el historial y en el panel,
  // así que las tres deben refrescarse.
  revalidatePath('/catalogo/album/[id]', 'page')
  revalidatePath('/escuchas')
  revalidatePath('/')

  return { ok: true, mensaje: `Registrada tu escucha de ${titulo}.` }
}

/** Registra de una vez todas las canciones de un álbum, para cuando escuchaste el LP entero. */
export async function registrarAlbumCompleto(
  _anterior: ResultadoEscucha | null,
  datos: FormData,
): Promise<ResultadoEscucha> {
  const ids = datos.getAll('trackIds').filter((v): v is string => typeof v === 'string')

  if (ids.length === 0) {
    return { ok: false, mensaje: 'Este álbum no tiene canciones registradas.' }
  }

  // Las escuchas se separan un segundo entre sí porque (trackId, playedAt) es único y,
  // más importante, porque así el historial conserva el orden real del disco.
  const inicio = Date.now()
  let registradas = 0
  try {
    for (const [indice, trackId] of ids.entries()) {
      await recordListen({
        trackId,
        playedAt: new Date(inicio + indice * 1000),
        source: 'MANUAL',
      })
      registradas++
    }
  } catch (error) {
    return {
      ok: false,
      mensaje:
        error instanceof Error
          ? `Se registraron ${registradas} de ${ids.length} canciones: ${error.message}`
          : 'No se pudieron registrar las escuchas.',
    }
  }

  revalidatePath('/catalogo/album/[id]', 'page')
  revalidatePath('/escuchas')
  revalidatePath('/')

  return {
    ok: true,
    mensaje: `Registradas ${registradas} escuchas del álbum completo.`,
  }
}
