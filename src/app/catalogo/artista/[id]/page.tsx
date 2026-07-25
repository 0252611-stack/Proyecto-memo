import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PortadaAlbum } from '@/components/PortadaAlbum'
import { Estrellas } from '@/components/ui/Estrellas'
import { obtenerArtista } from '@/lib/catalog/browse'

export const dynamic = 'force-dynamic'

export default async function DetalleArtista({
  params,
}: {
  // En Next.js 16 params es asíncrono.
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const artista = await obtenerArtista(id)
  if (!artista) notFound()

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/catalogo"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} aria-hidden />
        Volver al catálogo
      </Link>

      <h1 className="mt-5 font-display text-3xl text-foreground">{artista.name}</h1>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {artista.country ? (
          <div>
            <dt className="inline text-muted-foreground">País: </dt>
            <dd className="inline text-foreground">{artista.country}</dd>
          </div>
        ) : null}
        {artista.formedYear ? (
          <div>
            <dt className="inline text-muted-foreground">Desde: </dt>
            <dd className="inline text-foreground">{artista.formedYear}</dd>
          </div>
        ) : null}
      </dl>

      {artista.genres.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {artista.genres.map((g) => (
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

      {artista.bio ? (
        <p className="mt-4 max-w-prose whitespace-pre-line text-sm text-foreground">
          {artista.bio}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-lg text-foreground">
          Discografía
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {artista.albums.length} álbum{artista.albums.length === 1 ? '' : 'es'}
          </span>
        </h2>

        {artista.albums.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay álbumes de este artista en tu catálogo.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {artista.albums.map((a) => {
              const promedio =
                a.reviews.length > 0
                  ? Math.round(a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length)
                  : null
              return (
                <li key={a.id}>
                  <Link href={`/catalogo/album/${a.id}`} className="group block">
                    <PortadaAlbum
                      titulo={a.title}
                      coverUrl={a.coverUrl}
                      className="transition-transform group-hover:scale-[1.02]"
                    />
                    <p className="mt-2 truncate text-sm text-foreground" title={a.title}>
                      {a.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.releaseDate ? a.releaseDate.getUTCFullYear() : '—'} · {a._count.tracks}{' '}
                      canciones
                    </p>
                    {promedio !== null ? (
                      <Estrellas rating={promedio} size={12} className="mt-1" />
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
