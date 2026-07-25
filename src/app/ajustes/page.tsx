import { AlertTriangle, Check, Music2 } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { prisma } from '@/lib/db'
import { getRedirectUriFromEnv } from '@/lib/spotify/auth'
import { BotonesSpotify } from './BotonesSpotify'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ajustes — Memo',
}

function fechaLarga(fecha: Date) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(fecha)
}

export default async function Ajustes({
  searchParams,
}: {
  // En Next.js 16 searchParams es asíncrono.
  searchParams: Promise<{ conectado?: string; error?: string }>
}) {
  const { conectado, error } = await searchParams

  const hayCredenciales = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
  const cuenta = await prisma.spotifyAccount.findUnique({ where: { id: 'singleton' } })
  const redirectUri = getRedirectUriFromEnv()

  const mensajeError =
    error === 'sin-credenciales'
      ? 'Faltan las credenciales de Spotify en el archivo .env.'
      : error

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="font-display text-3xl text-foreground">Ajustes</h1>

      {conectado ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-accent bg-surface p-4 text-sm text-foreground"
        >
          <Check size={18} className="shrink-0 text-accent" aria-hidden />
          Spotify quedó conectado. Ya puedes sincronizar tus reproducciones.
        </p>
      ) : null}

      {mensajeError ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-destructive bg-surface p-4 text-sm text-foreground"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          {mensajeError}
        </p>
      ) : null}

      <div className="mt-6">
        <Panel titulo="Spotify">
          <p className="text-sm text-muted-foreground">
            Conecta tu cuenta para que Memo registre solo lo que escuchas, sin que tengas
            que anotarlo a mano.
          </p>

          {/* Spotify sólo devuelve las últimas 50 reproducciones y no guarda historial
              largo. Decirlo aquí evita que alguien confíe en esto como respaldo. */}
          <p className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            Ten en cuenta que Spotify sólo devuelve tus <strong>últimas 50 reproducciones</strong> y
            no conserva un historial largo. Si pasan semanas sin sincronizar, lo de en medio
            se pierde y no hay forma de recuperarlo.
          </p>

          {!hayCredenciales ? (
            <div className="mt-4 rounded-lg border border-border-strong p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <AlertTriangle size={16} className="shrink-0 text-star" aria-hidden />
                Falta configurar las credenciales
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Crea una aplicación en{' '}
                  <a
                    href="https://developer.spotify.com/dashboard"
                    className="text-secondary-foreground underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    el panel de desarrolladores de Spotify
                  </a>
                  .
                </li>
                <li>
                  Registra exactamente esta URL de redirección:
                  <code className="mt-1 block overflow-x-auto rounded bg-muted px-2 py-1 text-xs text-foreground">
                    {redirectUri}
                  </code>
                </li>
                <li>
                  Copia el Client ID y el Client Secret a <code>SPOTIFY_CLIENT_ID</code> y{' '}
                  <code>SPOTIFY_CLIENT_SECRET</code> en tu archivo <code>.env</code>.
                </li>
                <li>Reinicia el servidor de desarrollo.</li>
              </ol>
            </div>
          ) : cuenta ? (
            <div className="mt-4">
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="inline text-muted-foreground">Cuenta: </dt>
                  <dd className="inline text-foreground">
                    {cuenta.displayName ?? cuenta.spotifyUserId ?? 'conectada'}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Última sincronización: </dt>
                  <dd className="inline text-foreground">
                    {cuenta.lastSyncedAt ? fechaLarga(cuenta.lastSyncedAt) : 'nunca'}
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <BotonesSpotify />
              </div>
            </div>
          ) : (
            <a
              href="/api/auth/spotify"
              className="objetivo-tactil mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
              style={{ transitionDuration: 'var(--duracion-rapida)' }}
            >
              <Music2 size={16} aria-hidden />
              Conectar con Spotify
            </a>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel titulo="MusicBrainz">
          <p className="text-sm text-muted-foreground">
            El catálogo de artistas, álbumes y canciones viene de MusicBrainz.
            {process.env.MUSICBRAINZ_USER_AGENT ? (
              <> Está configurado y listo para usarse desde «Añadir música».</>
            ) : (
              <>
                {' '}
                Falta configurar <code>MUSICBRAINZ_USER_AGENT</code> en tu archivo{' '}
                <code>.env</code>: MusicBrainz exige identificarse con un nombre de aplicación
                y un correo de contacto.
              </>
            )}
          </p>
        </Panel>
      </div>
    </div>
  )
}
