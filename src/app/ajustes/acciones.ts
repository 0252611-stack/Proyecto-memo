'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { createAccountTokenProvider } from '@/lib/spotify/auth'
import { SpotifyClient } from '@/lib/spotify/client'
import { syncSpotifyListens } from '@/lib/spotify/sync'

export interface ResultadoSincronizacion {
  ok: boolean
  mensaje: string
}

/** Trae de Spotify las reproducciones nuevas desde la última sincronización. */
export async function sincronizarSpotify(): Promise<ResultadoSincronizacion> {
  try {
    const cliente = new SpotifyClient(createAccountTokenProvider())
    const resumen = await syncSpotifyListens(cliente)

    revalidatePath('/ajustes')
    revalidatePath('/escuchas')
    revalidatePath('/')

    if (resumen.listensCreated === 0) {
      return {
        ok: true,
        mensaje:
          resumen.listensFound === 0
            ? 'No había reproducciones nuevas desde la última sincronización.'
            : `Spotify devolvió ${resumen.listensFound} reproducciones y todas estaban ya registradas.`,
      }
    }

    const partes = [`${resumen.listensCreated} escuchas nuevas`]
    if (resumen.artistsCreated > 0) partes.push(`${resumen.artistsCreated} artistas`)
    if (resumen.albumsCreated > 0) partes.push(`${resumen.albumsCreated} álbumes`)
    if (resumen.tracksCreated > 0) partes.push(`${resumen.tracksCreated} canciones`)

    let mensaje = `Listo: ${partes.join(', ')}.`
    if (resumen.possibleGap) {
      mensaje +=
        ' Spotify devolvió el máximo de 50 reproducciones, así que puede haber escuchas ' +
        'anteriores que ya no se pueden recuperar. Sincroniza más seguido para no perderlas.'
    }
    return { ok: true, mensaje }
  } catch (error) {
    return {
      ok: false,
      mensaje:
        error instanceof Error
          ? `No se pudo sincronizar: ${error.message}`
          : 'No se pudo sincronizar con Spotify.',
    }
  }
}

/** Borra la conexión guardada. Las escuchas ya importadas se conservan. */
export async function desconectarSpotify(): Promise<ResultadoSincronizacion> {
  try {
    await prisma.spotifyAccount.deleteMany({ where: { id: 'singleton' } })
    revalidatePath('/ajustes')
    return { ok: true, mensaje: 'Spotify desconectado. Tus escuchas ya importadas se conservan.' }
  } catch {
    return { ok: false, mensaje: 'No se pudo desconectar la cuenta.' }
  }
}
