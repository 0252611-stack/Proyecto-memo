import { Disc3 } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Portada de un álbum, con respaldo cuando no hay imagen.
 *
 * El respaldo es determinista: el mismo título produce siempre el mismo tono, así el
 * estante de discos se ve variado sin depender de la red y sin que las portadas cambien
 * de color entre recargas.
 */
function tonoDeterminista(semilla: string): number {
  let h = 0
  for (let i = 0; i < semilla.length; i++) {
    h = (h * 31 + semilla.charCodeAt(i)) % 360
  }
  return h
}

export function PortadaAlbum({
  titulo,
  coverUrl,
  size = 200,
  className,
}: {
  titulo: string
  coverUrl?: string | null
  size?: number
  className?: string
}) {
  const clases = cn(
    'relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted',
    className,
  )

  if (coverUrl) {
    return (
      <div className={clases}>
        <Image
          src={coverUrl}
          alt={`Portada de ${titulo}`}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </div>
    )
  }

  const tono = tonoDeterminista(titulo)
  return (
    <div
      className={clases}
      // El respaldo es decorativo: el título ya está en el texto de la tarjeta, así que
      // repetirlo aquí sólo añadiría ruido para quien usa lector de pantalla.
      role="presentation"
      style={{
        background: `linear-gradient(135deg, hsl(${tono} 45% 22%), hsl(${(tono + 40) % 360} 50% 12%))`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Disc3
          size={Math.round(size * 0.32)}
          strokeWidth={1.25}
          className="text-foreground/25"
          aria-hidden
        />
      </div>
    </div>
  )
}
