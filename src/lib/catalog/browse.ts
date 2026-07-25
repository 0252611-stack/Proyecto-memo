import { prisma } from '@/lib/db'

type Db = typeof prisma

// Consultas de lectura del catálogo local.
//
// Separadas de import.ts a propósito: aquél trae música de MusicBrainz hacia la base,
// esto sólo lee lo que ya está guardado. Mezclarlas obligaría a cualquier página que
// quiere listar artistas a arrastrar el cliente de MusicBrainz sin necesitarlo.

export interface ArtistaResumen {
  id: string
  name: string
  imageUrl: string | null
  generos: { id: string; name: string }[]
  totalAlbums: number
  totalEscuchas: number
}

export interface AlbumResumen {
  id: string
  title: string
  albumType: string
  coverUrl: string | null
  releaseDate: Date | null
  artist: { id: string; name: string }
  generos: { id: string; name: string }[]
  totalTracks: number
  rating: number | null
}

/**
 * Normaliza texto para buscar: sin acentos y en minúsculas.
 *
 * SQLite no sabe ignorar acentos por su cuenta, y en un catálogo en español eso se nota
 * de inmediato: sin esto, buscar "cafe" no encuentra "Café Tacvba" ni "bjork" a "Björk".
 * El filtro se aplica en memoria sobre el resultado ya acotado por género o artista.
 * Para una biblioteca personal el costo es despreciable; si algún día crece a decenas de
 * miles de registros, habría que guardar una columna normalizada e indexarla.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export interface GeneroResumen {
  id: string
  name: string
  slug: string
  color: string | null
  totalArtistas: number
  totalAlbums: number
}

/** Lista los géneros con cuántos artistas y álbumes tiene cada uno, de mayor a menor. */
export async function listarGeneros(db: Db = prisma): Promise<GeneroResumen[]> {
  const generos = await db.genre.findMany({
    include: { _count: { select: { artists: true, albums: true } } },
    orderBy: { name: 'asc' },
  })

  return generos
    .map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      color: g.color,
      totalArtistas: g._count.artists,
      totalAlbums: g._count.albums,
    }))
    .sort((a, b) => b.totalAlbums - a.totalAlbums || a.name.localeCompare(b.name, 'es'))
}

/**
 * Lista artistas, opcionalmente filtrados por género y por texto.
 *
 * El conteo de escuchas se resuelve con una sola consulta agregada y luego se une en
 * memoria, en vez de consultar las escuchas de cada artista por separado.
 */
export async function listarArtistas(
  opciones: { generoSlug?: string; busqueda?: string } = {},
  db: Db = prisma,
): Promise<ArtistaResumen[]> {
  const artistas = await db.artist.findMany({
    where: {
      ...(opciones.generoSlug ? { genres: { some: { genre: { slug: opciones.generoSlug } } } } : {}),
    },
    include: {
      genres: { include: { genre: true } },
      _count: { select: { albums: true } },
    },
    orderBy: { name: 'asc' },
  })

  const escuchas = await db.$queryRaw<{ artistId: string; total: bigint | number }[]>`
    SELECT t.artistId AS artistId, COUNT(*) AS total
    FROM Listen l
    JOIN Track t ON t.id = l.trackId
    GROUP BY t.artistId
  `
  const porArtista = new Map(escuchas.map((e) => [e.artistId, Number(e.total)]))

  const termino = opciones.busqueda ? normalizar(opciones.busqueda) : null
  const filtrados = termino
    ? artistas.filter((a) => normalizar(a.name).includes(termino))
    : artistas

  return filtrados.map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.imageUrl,
    generos: a.genres.map((g) => ({ id: g.genre.id, name: g.genre.name })),
    totalAlbums: a._count.albums,
    totalEscuchas: porArtista.get(a.id) ?? 0,
  }))
}

/** Lista álbumes, opcionalmente filtrados por género, artista y texto. */
export async function listarAlbums(
  opciones: { generoSlug?: string; artistaId?: string; busqueda?: string } = {},
  db: Db = prisma,
): Promise<AlbumResumen[]> {
  const albums = await db.album.findMany({
    where: {
      ...(opciones.generoSlug ? { genres: { some: { genre: { slug: opciones.generoSlug } } } } : {}),
      ...(opciones.artistaId ? { artistId: opciones.artistaId } : {}),
    },
    include: {
      artist: { select: { id: true, name: true } },
      genres: { include: { genre: true } },
      reviews: { select: { rating: true } },
      _count: { select: { tracks: true } },
    },
    orderBy: [{ releaseDate: 'desc' }, { title: 'asc' }],
  })

  // La búsqueda mira también el nombre del artista: quien escribe "Björk" espera ver
  // sus discos, no una lista vacía porque ningún título contiene esa palabra.
  const termino = opciones.busqueda ? normalizar(opciones.busqueda) : null
  const filtrados = termino
    ? albums.filter(
        (a) =>
          normalizar(a.title).includes(termino) || normalizar(a.artist.name).includes(termino),
      )
    : albums

  return filtrados.map((a) => ({
    id: a.id,
    title: a.title,
    albumType: a.albumType,
    coverUrl: a.coverUrl,
    releaseDate: a.releaseDate,
    artist: a.artist,
    generos: a.genres.map((g) => ({ id: g.genre.id, name: g.genre.name })),
    totalTracks: a._count.tracks,
    // Un álbum tiene como mucho una reseña en la práctica, pero el esquema permite
    // varias, así que se promedia en lugar de asumir que hay una sola.
    rating:
      a.reviews.length > 0
        ? a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length
        : null,
  }))
}

/** Detalle de un álbum con sus canciones, o `null` si no existe. */
export async function obtenerAlbum(id: string, db: Db = prisma) {
  return db.album.findUnique({
    where: { id },
    include: {
      artist: true,
      genres: { include: { genre: true } },
      reviews: true,
      tracks: {
        include: {
          genres: { include: { genre: true } },
          reviews: { select: { id: true, rating: true } },
          _count: { select: { listens: true } },
        },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      },
    },
  })
}

/** Detalle de un artista con sus álbumes, o `null` si no existe. */
export async function obtenerArtista(id: string, db: Db = prisma) {
  return db.artist.findUnique({
    where: { id },
    include: {
      genres: { include: { genre: true } },
      albums: {
        include: {
          genres: { include: { genre: true } },
          reviews: { select: { rating: true } },
          _count: { select: { tracks: true } },
        },
        orderBy: [{ releaseDate: 'desc' }, { title: 'asc' }],
      },
    },
  })
}
