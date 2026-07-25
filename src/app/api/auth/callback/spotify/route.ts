import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import {
  createAccountTokenProvider,
  exchangeCodeForTokens,
  getRedirectUriFromEnv,
  getSpotifyOAuthConfigFromEnv,
  persistTokens,
} from '@/lib/spotify/auth'
import { SpotifyClient } from '@/lib/spotify/client'

const COOKIE_STATE = 'spotify_oauth_state'

function volverAAjustes(peticion: NextRequest, params: Record<string, string>) {
  const destino = new URL('/ajustes', peticion.nextUrl.origin)
  for (const [clave, valor] of Object.entries(params)) destino.searchParams.set(clave, valor)
  return NextResponse.redirect(destino)
}

/**
 * Recibe la respuesta de Spotify y guarda los tokens.
 *
 * La comprobación del `state` no es opcional: sin ella el flujo queda abierto a que un
 * tercero te haga llegar aquí con su propio código de autorización.
 */
export async function GET(peticion: NextRequest) {
  const params = peticion.nextUrl.searchParams
  const almacen = await cookies()
  const stateEsperado = almacen.get(COOKIE_STATE)?.value

  // La cookie se consume pase lo que pase: un `state` ya usado no debe poder reutilizarse.
  almacen.delete(COOKIE_STATE)

  const errorDeSpotify = params.get('error')
  if (errorDeSpotify) {
    const motivo =
      errorDeSpotify === 'access_denied'
        ? 'Cancelaste la autorización en Spotify.'
        : `Spotify devolvió un error: ${errorDeSpotify}`
    return volverAAjustes(peticion, { error: motivo })
  }

  const state = params.get('state')
  if (!stateEsperado || !state || state !== stateEsperado) {
    return volverAAjustes(peticion, {
      error:
        'La verificación de seguridad falló: el identificador de la sesión de autorización ' +
        'no coincide. Vuelve a intentar la conexión desde esta página.',
    })
  }

  const code = params.get('code')
  if (!code) {
    return volverAAjustes(peticion, { error: 'Spotify no devolvió ningún código de autorización.' })
  }

  try {
    const config = getSpotifyOAuthConfigFromEnv()
    const tokens = await exchangeCodeForTokens(fetch, config, {
      code,
      redirectUri: getRedirectUriFromEnv(),
    })
    await persistTokens(tokens)

    // El perfil sólo sirve para poder mostrar de qué cuenta se trata. Si falla, la
    // conexión ya es válida, así que no se tira todo por un dato decorativo.
    try {
      const cliente = new SpotifyClient(createAccountTokenProvider())
      const perfil = await cliente.getCurrentUserProfile()
      await persistTokens(tokens, {
        spotifyUserId: perfil.id,
        displayName: perfil.display_name ?? undefined,
      })
    } catch {
      // Sin perfil, pero conectado.
    }

    return volverAAjustes(peticion, { conectado: '1' })
  } catch (error) {
    return volverAAjustes(peticion, {
      error:
        error instanceof Error
          ? `No se pudo completar la conexión: ${error.message}`
          : 'No se pudo completar la conexión con Spotify.',
    })
  }
}
