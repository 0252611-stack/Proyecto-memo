// Datos semilla de Memo.
//
// El contenedor de desarrollo bloquea musicbrainz.org (ver docs/specs), así que estos
// datos no vienen de la API real: son un catálogo de ejemplo escrito a mano, con forma
// de `CatalogArtist`/`CatalogAlbumDetail` (los mismos tipos que produciría
// MusicBrainzCatalogSource), para poder reutilizar la lógica de importación de
// `src/lib/catalog/import.ts` — la misma que se usa cuando el usuario importa un álbum
// real desde la UI. Así el seed queda cubierto por la misma garantía de idempotencia
// que ya prueban `import.test.ts`: cada artista/álbum/canción se deduplica por su
// `mbid`, aquí un id sintético con el prefijo `seed:`.
//
// Idempotencia de escuchas y reseñas:
//   - Las escuchas se generan con fechas determinísticas (derivadas del día de hoy a
//     medianoche, no de la hora exacta), así que volver a correr el seed el mismo día
//     produce las mismas fechas y el `upsert` sobre (trackId, playedAt) no duplica.
//   - Las reseñas no tienen una clave natural en el esquema (más allá de `id`), así que
//     se les asigna un `id` fijo y se hace `upsert` sobre él.
//
// Ejecutar dos veces (`npm run db:seed`) debe dejar los mismos conteos.

import 'dotenv/config'
import { importAlbumWithTracks } from '@/lib/catalog/import'
import type { CatalogAlbumDetail, CatalogArtist } from '@/lib/catalog/types'
import { prisma } from '@/lib/db'

// --- Catálogo de ejemplo -----------------------------------------------------------

interface SeedTrack {
  title: string
  durationMs: number
  genres?: string[]
}

interface SeedAlbum {
  slug: string
  title: string
  albumType: CatalogAlbumDetail['albumType']
  releaseDate: string
  genres: string[]
  tracks: SeedTrack[]
}

interface SeedArtist {
  slug: string
  name: string
  sortName?: string
  country?: string
  formedYear?: number
  genres: string[]
  albums: SeedAlbum[]
}

const ARTISTS: SeedArtist[] = [
  {
    slug: 'cafe-tacvba',
    name: 'Café Tacvba',
    sortName: 'Cafe Tacvba',
    country: 'MX',
    formedYear: 1989,
    genres: ['Rock en Español', 'Alternative Rock'],
    albums: [
      {
        slug: 're',
        title: 'Re',
        albumType: 'LP',
        releaseDate: '1994-09-14',
        genres: ['Rock en Español'],
        tracks: [
          { title: 'El Aparato', durationMs: 245000, genres: ['Rock en Español'] },
          { title: 'El Borrego', durationMs: 198000, genres: ['Ska'] },
          { title: 'La Ingrata', durationMs: 231000 },
          { title: 'Ixchel', durationMs: 262000 },
          { title: 'El Ciclón', durationMs: 189000 },
        ],
      },
    ],
  },
  {
    slug: 'soda-stereo',
    name: 'Soda Stereo',
    country: 'AR',
    formedYear: 1982,
    genres: ['Rock en Español', 'Pop Rock'],
    albums: [
      {
        slug: 'cancion-animal',
        title: 'Canción Animal',
        albumType: 'LP',
        releaseDate: '1990-11-05',
        genres: ['Rock en Español'],
        tracks: [
          { title: 'De Música Ligera', durationMs: 205000, genres: ['Rock en Español'] },
          { title: 'Té para Tres', durationMs: 248000 },
          { title: 'Entre Caníbales', durationMs: 213000 },
          { title: 'Un Millón de Años Luz', durationMs: 222000 },
        ],
      },
    ],
  },
  {
    slug: 'bad-bunny',
    name: 'Bad Bunny',
    country: 'PR',
    formedYear: 2016,
    genres: ['Reggaetón', 'Latin Trap'],
    albums: [
      {
        slug: 'un-verano-sin-ti',
        title: 'Un Verano Sin Ti',
        albumType: 'LP',
        releaseDate: '2022-05-06',
        genres: ['Reggaetón', 'Pop Latino'],
        tracks: [
          { title: 'Moscow Mule', durationMs: 253000, genres: ['Reggaetón'] },
          { title: 'Después de la Playa', durationMs: 195000 },
          { title: 'Neverita', durationMs: 238000, genres: ['Latin Trap'] },
          { title: 'Ojitos Lindos', durationMs: 262000 },
          { title: 'Tití Me Preguntó', durationMs: 251000, genres: ['Reggaetón'] },
        ],
      },
    ],
  },
  {
    slug: 'natalia-lafourcade',
    name: 'Natalia Lafourcade',
    country: 'MX',
    formedYear: 2002,
    genres: ['Pop Latino', 'Folk'],
    albums: [
      {
        slug: 'musas-vol-1',
        title: 'Musas, Vol. 1',
        albumType: 'LP',
        releaseDate: '2017-06-16',
        genres: ['Folk', 'Pop Latino'],
        tracks: [
          { title: 'Hasta la Raíz', durationMs: 253000, genres: ['Folk'] },
          { title: 'Mi Lugar Favorito', durationMs: 214000 },
          { title: 'Danza de Gardenias', durationMs: 197000 },
          { title: 'Mexicana Hermosa', durationMs: 229000, genres: ['Pop Latino'] },
        ],
      },
    ],
  },
  {
    slug: 'bjork',
    name: 'Björk',
    country: 'IS',
    formedYear: 1993,
    genres: ['Art Pop', 'Electrónica'],
    albums: [
      {
        slug: 'homogenic',
        title: 'Homogenic',
        albumType: 'LP',
        releaseDate: '1997-09-22',
        genres: ['Art Pop', 'Electrónica'],
        tracks: [
          { title: 'Jóga', durationMs: 302000, genres: ['Art Pop'] },
          { title: 'Bachelorette', durationMs: 337000 },
          { title: 'Hunter', durationMs: 256000 },
          { title: 'All Is Full of Love', durationMs: 315000, genres: ['Electrónica'] },
        ],
      },
    ],
  },
  {
    slug: 'radiohead',
    name: 'Radiohead',
    country: 'GB',
    formedYear: 1985,
    genres: ['Alternative Rock', 'Art Rock'],
    albums: [
      {
        slug: 'ok-computer',
        title: 'OK Computer',
        albumType: 'LP',
        releaseDate: '1997-05-21',
        genres: ['Alternative Rock', 'Art Rock'],
        tracks: [
          { title: 'Paranoid Android', durationMs: 383000, genres: ['Art Rock'] },
          { title: 'Karma Police', durationMs: 261000 },
          { title: 'No Surprises', durationMs: 229000 },
          { title: 'Let Down', durationMs: 299000, genres: ['Alternative Rock'] },
        ],
      },
    ],
  },
  {
    slug: 'kendrick-lamar',
    name: 'Kendrick Lamar',
    country: 'US',
    formedYear: 2003,
    genres: ['Hip Hop', 'Jazz Rap'],
    albums: [
      {
        slug: 'to-pimp-a-butterfly',
        title: 'To Pimp a Butterfly',
        albumType: 'LP',
        releaseDate: '2015-03-15',
        genres: ['Hip Hop', 'Jazz Rap'],
        tracks: [
          { title: 'Alright', durationMs: 219000, genres: ['Hip Hop'] },
          { title: 'King Kunta', durationMs: 234000 },
          { title: 'The Blacker the Berry', durationMs: 356000 },
          { title: 'i', durationMs: 226000, genres: ['Jazz Rap'] },
        ],
      },
    ],
  },
  {
    slug: 'rosalia',
    name: 'Rosalía',
    country: 'ES',
    formedYear: 2016,
    genres: ['Flamenco Pop', 'Pop Latino'],
    albums: [
      {
        slug: 'el-mal-querer',
        title: 'El Mal Querer',
        albumType: 'LP',
        releaseDate: '2018-11-02',
        genres: ['Flamenco Pop'],
        tracks: [
          { title: 'Malamente', durationMs: 160000, genres: ['Flamenco Pop'] },
          { title: 'Pienso en Tu Mirá', durationMs: 195000 },
          { title: 'Di Mi Nombre', durationMs: 172000 },
          { title: 'Bagdad', durationMs: 253000, genres: ['Pop Latino'] },
        ],
      },
    ],
  },
  {
    slug: 'daft-punk',
    name: 'Daft Punk',
    country: 'FR',
    formedYear: 1993,
    genres: ['Electrónica', 'House'],
    albums: [
      {
        slug: 'discovery',
        title: 'Discovery',
        albumType: 'LP',
        releaseDate: '2001-03-12',
        genres: ['Electrónica', 'House'],
        tracks: [
          { title: 'One More Time', durationMs: 320000, genres: ['House'] },
          { title: 'Digital Love', durationMs: 300000 },
          { title: 'Harder, Better, Faster, Stronger', durationMs: 224000 },
          { title: 'Aerodynamic', durationMs: 212000, genres: ['Electrónica'] },
        ],
      },
    ],
  },
  {
    slug: 'metallica',
    name: 'Metallica',
    country: 'US',
    formedYear: 1981,
    genres: ['Heavy Metal', 'Thrash Metal'],
    albums: [
      {
        slug: 'master-of-puppets',
        title: 'Master of Puppets',
        albumType: 'LP',
        releaseDate: '1986-03-03',
        genres: ['Thrash Metal'],
        tracks: [
          { title: 'Battery', durationMs: 312000, genres: ['Thrash Metal'] },
          { title: 'Master of Puppets', durationMs: 515000 },
          { title: 'Welcome Home (Sanitarium)', durationMs: 388000, genres: ['Heavy Metal'] },
          { title: 'Orion', durationMs: 508000 },
        ],
      },
    ],
  },
]

function toCatalogArtist(artist: SeedArtist): CatalogArtist {
  return {
    sourceId: `seed:artist:${artist.slug}`,
    name: artist.name,
    sortName: artist.sortName,
    country: artist.country,
    formedYear: artist.formedYear,
    genres: artist.genres,
  }
}

function toCatalogAlbumDetail(artist: SeedArtist, album: SeedAlbum): CatalogAlbumDetail {
  return {
    sourceId: `seed:album:${album.slug}`,
    title: album.title,
    artistSourceId: `seed:artist:${artist.slug}`,
    artistName: artist.name,
    albumType: album.albumType,
    releaseDate: album.releaseDate,
    totalTracks: album.tracks.length,
    genres: album.genres,
    tracks: album.tracks.map((track, index) => ({
      sourceId: `seed:track:${album.slug}:${index + 1}`,
      title: track.title,
      trackNumber: index + 1,
      discNumber: 1,
      durationMs: track.durationMs,
      genres: track.genres ?? [],
    })),
  }
}

async function seedCatalog(): Promise<void> {
  for (const artist of ARTISTS) {
    for (const album of artist.albums) {
      await importAlbumWithTracks(prisma, toCatalogArtist(artist), toCatalogAlbumDetail(artist, album))
    }
  }
}

// --- Escuchas -----------------------------------------------------------------------
// ~40 escuchas repartidas en los últimos 3 meses. Las fechas se derivan del día de hoy
// a medianoche (no de la hora exacta de ejecución), y todo lo demás es una función pura
// del índice `i`: dos ejecuciones el mismo día generan exactamente las mismas fechas, y
// el `upsert` sobre (trackId, playedAt) evita duplicar filas.

const LISTEN_COUNT = 42
const LISTEN_HOURS = [8, 9, 11, 13, 14, 16, 18, 19, 20, 21, 22, 23]
const LISTEN_SOURCES = ['SPOTIFY', 'SPOTIFY', 'MANUAL'] as const

function todayAtMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function seedListens(): Promise<number> {
  const tracks = await prisma.track.findMany({ orderBy: { id: 'asc' } })
  if (tracks.length === 0) return 0

  const midnight = todayAtMidnight()
  let created = 0

  for (let i = 0; i < LISTEN_COUNT; i++) {
    const track = tracks[(i * 7) % tracks.length]
    // Días hacia atrás, repartidos de ~1 a ~90 (últimos 3 meses).
    const dayOffset = 1 + Math.floor((i * 89) / (LISTEN_COUNT - 1))
    const playedAt = new Date(midnight)
    playedAt.setDate(playedAt.getDate() - dayOffset)
    playedAt.setHours(LISTEN_HOURS[i % LISTEN_HOURS.length], (i * 17) % 60, 0, 0)

    await prisma.listen.upsert({
      where: { trackId_playedAt: { trackId: track.id, playedAt } },
      update: {},
      create: {
        trackId: track.id,
        playedAt,
        source: LISTEN_SOURCES[i % LISTEN_SOURCES.length],
        msPlayed: track.durationMs ?? undefined,
      },
    })
    created += 1
  }

  return created
}

// --- Reseñas ------------------------------------------------------------------------
// El esquema no tiene una clave natural para una reseña (más allá de `id`), así que cada
// una lleva un id fijo y se guarda con `upsert` sobre ese id: reseñas de ejemplo, mezcla
// de álbum y canción.

interface ReviewSeed {
  id: string
  albumTitle?: string
  trackTitle?: string
  rating: number
  title?: string
  body?: string
  context?: string
  daysAgo: number
  isFavorite?: boolean
}

const REVIEW_SEEDS: ReviewSeed[] = [
  {
    id: 'seed-review-re',
    albumTitle: 'Re',
    rating: 10,
    title: 'Un clásico que no envejece',
    body: 'Cada vez que lo escucho encuentro un detalle nuevo. La producción sigue sonando fresca treinta años después.',
    context: 'Viaje en camión a Puebla, audífonos puestos todo el trayecto.',
    daysAgo: 40,
    isFavorite: true,
  },
  {
    id: 'seed-review-el-mal-querer',
    albumTitle: 'El Mal Querer',
    rating: 9,
    title: 'Flamenco reinventado',
    body: 'La mezcla de flamenco tradicional con producción moderna es impecable de principio a fin.',
    context: 'De fondo mientras cocinaba un domingo.',
    daysAgo: 12,
  },
  {
    id: 'seed-review-joga',
    trackTitle: 'Jóga',
    rating: 10,
    title: 'La canción perfecta para una noche de insomnio',
    context: 'Con audífonos, ya tarde, sin poder dormir.',
    daysAgo: 5,
    isFavorite: true,
  },
  {
    id: 'seed-review-neverita',
    trackTitle: 'Neverita',
    rating: 8,
    context: 'En el gym, en la caminadora.',
    daysAgo: 3,
  },
  {
    id: 'seed-review-cancion-animal',
    albumTitle: 'Canción Animal',
    rating: 9,
    title: 'Rock en español en su mejor momento',
    body: '"De Música Ligera" es de esas canciones que se saben de memoria sin haberlas estudiado nunca.',
    daysAgo: 60,
  },
]

async function seedReviews(): Promise<number> {
  const midnight = todayAtMidnight()
  let created = 0

  for (const seed of REVIEW_SEEDS) {
    const listenedOn = new Date(midnight)
    listenedOn.setDate(listenedOn.getDate() - seed.daysAgo)

    const albumId = seed.albumTitle
      ? (await prisma.album.findFirstOrThrow({ where: { title: seed.albumTitle } })).id
      : undefined
    const trackId = seed.trackTitle
      ? (await prisma.track.findFirstOrThrow({ where: { title: seed.trackTitle } })).id
      : undefined

    await prisma.review.upsert({
      where: { id: seed.id },
      update: {},
      create: {
        id: seed.id,
        albumId,
        trackId,
        rating: seed.rating,
        title: seed.title,
        body: seed.body,
        context: seed.context,
        listenedOn,
        isFavorite: seed.isFavorite ?? false,
      },
    })
    created += 1
  }

  return created
}

// --- Entrada ------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Sembrando catálogo (artistas, álbumes, canciones, géneros)...')
  await seedCatalog()

  console.log('Sembrando escuchas...')
  await seedListens()

  console.log('Sembrando reseñas...')
  await seedReviews()

  const [artists, albums, tracks, genres, listens, reviews] = await Promise.all([
    prisma.artist.count(),
    prisma.album.count(),
    prisma.track.count(),
    prisma.genre.count(),
    prisma.listen.count(),
    prisma.review.count(),
  ])

  console.log(
    `Listo: ${artists} artistas, ${albums} álbumes, ${tracks} canciones, ${genres} géneros, ` +
      `${listens} escuchas, ${reviews} reseñas.`,
  )
}

main()
  .catch((error) => {
    console.error('Error sembrando la base de datos:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
