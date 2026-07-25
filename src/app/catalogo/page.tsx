import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { PortadaAlbum } from '@/components/PortadaAlbum'
import { SinDatos } from '@/components/Panel'
import { Estrellas } from '@/components/ui/Estrellas'
import { listarAlbums, listarArtistas, listarGeneros } from '@/lib/catalog/browse'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Catálogo — Memo',
}

function anio(fecha: Date | null) {
  return fecha ? String(fecha.getUTCFullYear()) : null
}

export default async function Catalogo({
  searchParams,
}: {
  // En Next.js 16 searchParams es asíncrono.
  searchParams: Promise<{ genero?: string; q?: string }>
}) {
  const { genero, q } = await searchParams
  const busqueda = q?.trim() || undefined

  const [generos, artistas, albums] = await Promise.all([
    listarGeneros(),
    listarArtistas({ generoSlug: genero, busqueda }),
    listarAlbums({ generoSlug: genero, busqueda }),
  ])

  const generoActivo = generos.find((g) => g.slug === genero)
  const hayFiltro = Boolean(genero || busqueda)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Catálogo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {generos.length} géneros · {artistas.length} artistas · {albums.length} álbumes
            {hayFiltro ? ' con este filtro' : ''}
          </p>
        </div>
        <Link
          href="/catalogo/importar"
          className="objetivo-tactil inline-flex items-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          style={{ transitionDuration: 'var(--duracion-rapida)' }}
        >
          <Plus size={16} aria-hidden />
          Añadir música
        </Link>
      </div>

      {/* Búsqueda por GET: la consulta queda en la URL, así se puede compartir y
          funciona sin JavaScript. */}
      <form method="get" className="mt-5 flex gap-2">
        {genero ? <input type="hidden" name="genero" value={genero} /> : null}
        <label htmlFor="q" className="sr-only">
          Buscar artista o álbum
        </label>
        <div className="relative flex-1">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={busqueda ?? ''}
            placeholder="Buscar artista o álbum"
            className="h-11 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="submit"
          className="objetivo-tactil rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          style={{ transitionDuration: 'var(--duracion-rapida)' }}
        >
          Buscar
        </button>
      </form>

      {/* Filtro por género */}
      <nav aria-label="Filtrar por género" className="mt-4 flex flex-wrap gap-2">
        <Link
          href={busqueda ? `/catalogo?q=${encodeURIComponent(busqueda)}` : '/catalogo'}
          aria-current={!genero ? 'true' : undefined}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition-colors',
            !genero
              ? 'border-accent bg-accent text-on-accent'
              : 'border-border-strong text-muted-foreground hover:text-foreground',
          )}
          style={{ transitionDuration: 'var(--duracion-rapida)' }}
        >
          Todos
        </Link>
        {generos.map((g) => {
          const activo = g.slug === genero
          const params = new URLSearchParams({ genero: g.slug })
          if (busqueda) params.set('q', busqueda)
          return (
            <Link
              key={g.id}
              href={`/catalogo?${params}`}
              aria-current={activo ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                activo
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-border-strong text-muted-foreground hover:text-foreground',
              )}
              style={{ transitionDuration: 'var(--duracion-rapida)' }}
            >
              {g.name}
              <span className="ml-1.5 text-xs opacity-70">{g.totalAlbums}</span>
            </Link>
          )
        })}
      </nav>

      {hayFiltro && albums.length === 0 && artistas.length === 0 ? (
        <SinDatos>
          Nada coincide con {busqueda ? `“${busqueda}”` : 'este filtro'}
          {generoActivo ? ` en ${generoActivo.name}` : ''}.
        </SinDatos>
      ) : null}

      {/* Estante de discos */}
      {albums.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg text-foreground">Álbumes</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {albums.map((a) => (
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
                  <p className="truncate text-xs text-muted-foreground" title={a.artist.name}>
                    {a.artist.name}
                    {anio(a.releaseDate) ? ` · ${anio(a.releaseDate)}` : ''}
                  </p>
                  {a.rating !== null ? (
                    <Estrellas rating={Math.round(a.rating)} size={12} className="mt-1" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Artistas */}
      {artistas.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-lg text-foreground">Artistas</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {artistas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/catalogo/artista/${a.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
                  style={{ transitionDuration: 'var(--duracion-rapida)' }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.generos.map((g) => g.name).join(' · ') || 'Sin género'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {a.totalAlbums} álbum{a.totalAlbums === 1 ? '' : 'es'}
                    <br />
                    {a.totalEscuchas} escucha{a.totalEscuchas === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
