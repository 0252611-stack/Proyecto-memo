import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  buildAuthorizeUrl,
  generateState,
  getRedirectUriFromEnv,
  getSpotifyOAuthConfigFromEnv,
} from '@/lib/spotify/auth'

export const COOKIE_STATE = 'spotify_oauth_state'

/**
 * Inicia el flujo OAuth: genera el `state`, lo guarda en una cookie y redirige a
 * Spotify.
 *
 * El `state` viaja por dos caminos distintos —la URL y la cookie— precisamente para que
 * el callback pueda comprobar que coinciden. Sin esa comprobación, cualquiera podría
 * hacerte llegar a la ruta de callback con un código suyo y dejar tu Memo conectado a la
 * cuenta de Spotify de otra persona.
 */
export async function GET() {
  let config
  try {
    config = getSpotifyOAuthConfigFromEnv()
  } catch {
    return NextResponse.redirect(
      new URL('/ajustes?error=sin-credenciales', getRedirectUriFromEnv()),
    )
  }

  const state = generateState()
  const almacen = await cookies()
  almacen.set(COOKIE_STATE, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === 'production',
  })

  return NextResponse.redirect(
    buildAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: getRedirectUriFromEnv(),
      state,
    }),
  )
}
