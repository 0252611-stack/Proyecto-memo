import { AlertTriangle, ArrowLeft, Check, Search } from 'lucide-react'
import Link from 'next/link'
import { crearFuenteCatalogo } from './acciones'
import { BotonImportar } from './BotonImportar'
import { buscarEnCatalogo, mensajeErrorCatalogo, type ResultadoBusquedaAlbum } from './catalogo-local'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Añadir música — Memo',
}

/** Aviso destacado, para lo que impide buscar o para un fallo de la búsqueda. */
function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-6 flex gap-3 rounded-xl border border-border-strong bg-surface p-4"
    >
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-star" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{titulo}</p>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

function Resultado({ album }: { album: ResultadoBusquedaAlbum }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{album.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {album.artistName}
          {album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''} · {album.albumType}
          {album.totalTracks ? ` · ${album.totalTracks} canciones` : ''}
        </p>
      </div>
      {album.albumIdLocal ? (
        <Link
          href={`/catalogo/album/${album.albumIdLocal}`}
          className="objetivo-tactil inline-flex shrink-0 items-center gap-1.5 px-3 text-sm text-accent hover:underline"
        >
          <Check size={16} aria-hidden />
          Ya está en tu catálogo
        </Link>
      ) : (
        <BotonImportar sourceId={album.sourceId} titulo={album.title} />
      )}
    </li>
  )
}

export default async function Importar({
  searchParams,
}: {
  // En Next.js 16 searchParams es asíncrono.
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const consulta = q?.trim() || undefined

  const { fuente, error: errorConfiguracion } = await crearFuenteCatalogo()

  let resultados: ResultadoBusquedaAlbum[] = []
  let errorBusqueda: string | null = null

  if (consulta && fuente) {
    try {
      resultados = await buscarEnCatalogo(consulta, fuente)
    } catch (e) {
      errorBusqueda = mensajeErrorCatalogo(e)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/catalogo"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} aria-hidden />
        Volver al catálogo
      </Link>

      <h1 className="mt-4 font-display text-3xl text-foreground">Añadir música</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Busca un álbum en MusicBrainz y añádelo a tu catálogo con todas sus canciones.
        MusicBrainz permite una petición por segundo, así que la búsqueda puede tardar
        unos segundos.
      </p>

      <form method="get" className="mt-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar álbum en MusicBrainz
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
            defaultValue={consulta ?? ''}
            placeholder="Título del álbum o nombre del artista"
            className="h-11 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="submit"
          disabled={Boolean(errorConfiguracion)}
          className="objetivo-tactil rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ transitionDuration: 'var(--duracion-rapida)' }}
        >
          Buscar
        </button>
      </form>

      {errorConfiguracion ? (
        <Aviso titulo="Falta configurar MusicBrainz">
          <p>{errorConfiguracion}</p>
          <p className="mt-2">
            Añade la variable a tu archivo <code>.env</code> y reinicia el servidor. Puedes
            copiar el formato desde <code>.env.example</code>.
          </p>
        </Aviso>
      ) : null}

      {errorBusqueda ? (
        <Aviso titulo="No se pudo completar la búsqueda">{errorBusqueda}</Aviso>
      ) : null}

      {consulta && !errorConfiguracion && !errorBusqueda ? (
        resultados.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            MusicBrainz no encontró nada para “{consulta}”. Prueba con el nombre del artista
            o con menos palabras.
          </p>
        ) : (
          <section className="mt-6">
            <h2 className="font-display text-lg text-foreground">
              {resultados.length} resultado{resultados.length === 1 ? '' : 's'}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              {resultados.map((a) => (
                <Resultado key={a.sourceId} album={a} />
              ))}
            </ul>
          </section>
        )
      ) : null}
    </div>
  )
}
