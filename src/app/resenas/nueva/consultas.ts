import { prisma } from '@/lib/db'

// Esta ruta consulta Prisma directamente (en vez de pasar por src/lib/) porque sólo
// necesita listas simples para llenar los <select> del formulario: no hay lógica de
// negocio que justifique un módulo aparte en src/lib/.

export interface OpcionAlbum {
  id: string
  titulo: string
  artista: string
}

export interface OpcionCancion {
  id: string
  titulo: string
  artista: string
}

/** Álbumes del catálogo, para el `<select>` de "reseñar un álbum". */
export async function listarOpcionesAlbum(): Promise<OpcionAlbum[]> {
  const albumes = await prisma.album.findMany({
    include: { artist: true },
    orderBy: [{ artist: { name: 'asc' } }, { title: 'asc' }],
  })
  return albumes.map((a) => ({ id: a.id, titulo: a.title, artista: a.artist.name }))
}

/** Canciones del catálogo, para el `<select>` de "reseñar una canción". */
export async function listarOpcionesCancion(): Promise<OpcionCancion[]> {
  const canciones = await prisma.track.findMany({
    include: { artist: true },
    orderBy: [{ artist: { name: 'asc' } }, { title: 'asc' }],
  })
  return canciones.map((t) => ({ id: t.id, titulo: t.title, artista: t.artist.name }))
}
