// Lógica de esta ruta que conviene poder probar sin salir a la red: buscar en el
// catálogo externo marcando qué ya está importado, importar un resultado concreto, y
// traducir los errores del catálogo a mensajes legibles en español.
//
// Todo recibe la `MusicCatalogSource` (y, para las funciones que tocan la base, el
// cliente Prisma) por parámetro en vez de instanciarlas aquí dentro. Así, en las pruebas
// se puede inyectar una fuente falsa y una base de datos temporal sin tocar la red real
// ni `src/lib/`, que es justo el mismo patrón que ya usa `src/lib/catalog/musicbrainz.ts`
// (fetch inyectado) y `src/lib/catalog/browse.ts` (`db` inyectado con valor por omisión).

import type { PrismaClient } from '@/generated/prisma/client'
import { importAlbumWithTracks } from '@/lib/catalog/import'
import { MusicBrainzNotFoundError, MusicBrainzRateLimitError } from '@/lib/catalog/musicbrainz'
import type { CatalogAlbum, CatalogArtist, MusicCatalogSource } from '@/lib/catalog/types'
import { prisma } from '@/lib/db'

type Db = Pick<PrismaClient, 'artist' | 'album' | 'track' | 'genre' | 'artistGenre' | 'albumGenre' | 'trackGenre'>

/** Resultado de búsqueda con la marca de si ese álbum ya existe en el catálogo local. */
export interface ResultadoBusquedaAlbum extends CatalogAlbum {
  /** Id local del álbum si ya fue importado (se dedupe por `mbid`), `null` si no. */
  albumIdLocal: string | null
}

/**
 * Busca álbumes en la fuente de catálogo dada y marca cuáles ya están en la base local,
 * consultando por `mbid` (el `sourceId` que expone la fuente).
 */
export async function buscarEnCatalogo(
  query: string,
  source: MusicCatalogSource,
  db: Db = prisma,
): Promise<ResultadoBusquedaAlbum[]> {
  const resultados = await source.searchAlbums(query)
  if (resultados.length === 0) return []

  const existentes = await db.album.findMany({
    where: { mbid: { in: resultados.map((a) => a.sourceId) } },
    select: { id: true, mbid: true },
  })
  const idLocalPorMbid = new Map(existentes.map((a) => [a.mbid, a.id]))

  return resultados.map((a) => ({ ...a, albumIdLocal: idLocalPorMbid.get(a.sourceId) ?? null }))
}

/**
 * Importa al catálogo local el álbum identificado por `albumSourceId` en la fuente dada,
 * junto con sus canciones. Devuelve el id local del álbum importado.
 *
 * La búsqueda de álbumes (`searchAlbums`) no trae los géneros propios del artista, así
 * que aquí se construye un `CatalogArtist` mínimo con lo que ya se tiene (id y nombre);
 * si el artista se reimporta más adelante desde su propia ficha, sus géneros se
 * completarán entonces. Preferible a encadenar una búsqueda de artista aparte, que
 * gastaría otra petición contra un servicio limitado a 1 por segundo sólo para rellenar
 * un dato secundario.
 */
export async function importarDesdeResultado(
  albumSourceId: string,
  source: MusicCatalogSource,
  db: Db = prisma,
): Promise<string> {
  const detalle = await source.getAlbumDetail(albumSourceId)
  if (!detalle) {
    throw new MusicBrainzNotFoundError(`/release/${albumSourceId}`)
  }

  const artista: CatalogArtist = {
    sourceId: detalle.artistSourceId,
    name: detalle.artistName,
    genres: [],
  }

  const { albumId } = await importAlbumWithTracks(db, artista, detalle)
  return albumId
}

/** Traduce un error del catálogo a un mensaje legible en español para mostrar en la UI. */
export function mensajeErrorCatalogo(error: unknown): string {
  if (error instanceof MusicBrainzRateLimitError) {
    return (
      'MusicBrainz está limitando las peticiones (máximo una por segundo) y no respondió ' +
      'tras varios intentos. Espera un momento y vuelve a intentarlo.'
    )
  }
  if (error instanceof MusicBrainzNotFoundError) {
    return 'MusicBrainz no encontró ese álbum. Puede que se haya movido o eliminado del catálogo original.'
  }
  if (error instanceof Error && error.message.includes('MUSICBRAINZ_USER_AGENT')) {
    return 'Falta configurar MUSICBRAINZ_USER_AGENT en el entorno. Revisa .env.example.'
  }
  return (
    'No se pudo contactar con MusicBrainz: puede estar lento, caído, o tu conexión no llega ' +
    'a musicbrainz.org en este momento. Inténtalo de nuevo en unos segundos.'
  )
}
