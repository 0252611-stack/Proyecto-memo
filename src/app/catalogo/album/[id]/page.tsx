import { ArrowLeft, PenLine } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PortadaAlbum } from '@/components/PortadaAlbum'
import { Estrellas } from '@/components/ui/Estrellas'
import { obtenerAlbum } from '@/lib/catalog/browse'

export const dynamic = 'force-dynamic'

function duracion(ms: number | null) {
  if (!ms) return null
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default async function DetalleAlbum({
  params,
}: {
  // En Next.js 16 params es asíncrono.
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const album = await obtenerAlbum(id)
  if (!album) notFound()

  const resena = album.reviews[0] ?? null

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/catalogo"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} aria-hidden />
        Volver al catálogo
      </Link>

      <div className="mt-5 flex flex-col gap-6 sm:flex-row">
        <div className="w-full max-w-[220px] shrink-0">
          <PortadaAlbum titulo={album.title} coverUrl={album.coverUrl} size={220} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {album.albumType}
          </p>
          <h1 className="mt-1 font-display text-3xl text-foreground">{album.title}</h1>
          <Link
            href={`/catalogo/artista/${album.artist.id}`}
            className="mt-1 inline-block text-secondary-foreground hover:underline"
          >
            {album.artist.name}
          </Link>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {album.releaseDate ? (
              <div>
                <dt className="inline text-muted-foreground">Lanzamiento: </dt>
                <dd className="inline text-foreground">
                  {new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(
                    album.releaseDate,
                  )}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-muted-foreground">Canciones: </dt>
              <dd className="inline text-foreground">{album.tracks.length}</dd>
            </div>
          </dl>

          {album.genres.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {album.genres.map((g) => (
                <li key={g.genre.id}>
                  <Link
                    href={`/catalogo?genero=${g.genre.slug}`}
                    className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {g.genre.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5">
            {resena ? (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Estrellas rating={resena.rating} size={18} />
                  {resena.title ? (
                    <span className="font-medium text-foreground">{resena.title}</span>
                  ) : null}
                </div>
                {resena.body ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-foreground">{resena.body}</p>
                ) : null}
                {resena.context ? (
                  <p className="mt-2 text-sm italic text-muted-foreground">{resena.context}</p>
                ) : null}
              </div>
            ) : (
              <Link
                href={`/resenas/nueva?albumId=${album.id}`}
                className="objetivo-tactil inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent"
              >
                <PenLine size={16} aria-hidden />
                Reseñar este LP
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg text-foreground">Canciones</h2>
        {album.tracks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este álbum todavía no tiene canciones registradas.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
            {album.tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-4 py-3">
                <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                  {t.trackNumber ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{t.title}</span>
                  {t._count.listens > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t._count.listens} escucha{t._count.listens === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
                {t.reviews[0] ? (
                  <Estrellas rating={t.reviews[0].rating} size={13} />
                ) : (
                  <Link
                    href={`/resenas/nueva?trackId=${t.id}`}
                    className="shrink-0 text-xs text-secondary-foreground hover:underline"
                  >
                    Reseñar
                  </Link>
                )}
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {duracion(t.durationMs) ?? ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
