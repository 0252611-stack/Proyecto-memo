// Tipos neutrales del catálogo musical.
//
// Estos tipos son el contrato entre la aplicación y cualquier proveedor externo de
// catálogo (MusicBrainz hoy, quizá otro mañana). Nunca deben filtrar formas de datos
// propias de un proveedor (por ejemplo los `id`/`score`/`disambiguation` crudos de la
// API de MusicBrainz) para que el resto de la app no quede acoplada a él.

/** Artista tal como lo expone el catálogo, antes de guardarse en la base de datos. */
export interface CatalogArtist {
  /** Identificador estable en el catálogo de origen (p. ej. el MBID de MusicBrainz). */
  sourceId: string
  name: string
  sortName?: string
  country?: string
  formedYear?: number
  /** Géneros/etiquetas asociados al artista en el catálogo. */
  genres: string[]
  disambiguation?: string
}

/** Álbum (release) tal como lo expone el catálogo. */
export interface CatalogAlbum {
  sourceId: string
  title: string
  /** Identificador del artista principal en el catálogo de origen. */
  artistSourceId: string
  artistName: string
  /** LP | EP | SINGLE | COMPILATION — ya normalizado a los valores que usa Memo. */
  albumType: 'LP' | 'EP' | 'SINGLE' | 'COMPILATION'
  releaseDate?: string
  coverUrl?: string
  totalTracks?: number
  genres: string[]
}

/** Canción tal como la expone el catálogo, siempre dentro de un álbum. */
export interface CatalogTrack {
  sourceId: string
  title: string
  trackNumber?: number
  discNumber?: number
  durationMs?: number
  genres: string[]
}

/** Detalle completo de un álbum: sus metadatos más la lista de canciones. */
export interface CatalogAlbumDetail extends CatalogAlbum {
  tracks: CatalogTrack[]
}

/**
 * Fuente de catálogo musical: búsqueda de artistas, búsqueda de álbumes y detalle de
 * un álbum con sus canciones. Cualquier proveedor (MusicBrainz, uno local para pruebas,
 * etc.) implementa esta interfaz; el resto de la aplicación sólo conoce esta forma.
 */
export interface MusicCatalogSource {
  /** Busca artistas por nombre. */
  searchArtists(query: string): Promise<CatalogArtist[]>

  /**
   * Busca álbumes (releases) por título, opcionalmente acotando por artista.
   */
  searchAlbums(query: string, options?: { artistSourceId?: string }): Promise<CatalogAlbum[]>

  /** Obtiene el detalle de un álbum, incluidas sus canciones, por su id de catálogo. */
  getAlbumDetail(albumSourceId: string): Promise<CatalogAlbumDetail | null>
}
