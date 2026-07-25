import { listarOpcionesAlbum, listarOpcionesCancion } from './consultas'
import { FormularioResena } from './FormularioResena'

// Las listas de álbumes y canciones cambian según lo que haya en el catálogo, así que
// se recalculan en cada visita en lugar de servirse desde caché.
export const dynamic = 'force-dynamic'

export default async function NuevaResena() {
  const [albumes, canciones] = await Promise.all([listarOpcionesAlbum(), listarOpcionesCancion()])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="font-display text-3xl text-foreground">Nueva reseña</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Escribe lo que te pareció un álbum o una canción.
      </p>

      <FormularioResena albumes={albumes} canciones={canciones} className="mt-6" />
    </div>
  )
}
