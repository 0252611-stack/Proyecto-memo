import { Star, StarHalf } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ratingToStars } from '@/lib/schemas'

/**
 * Muestra una calificación entera de 1..10 como 0.5..5 estrellas.
 *
 * La calificación se anuncia además como texto para lectores de pantalla: un usuario
 * que no ve los íconos necesita el valor, no una fila de gráficos sin nombre.
 */
export function Estrellas({
  rating,
  size = 16,
  className,
}: {
  rating: number
  size?: number
  className?: string
}) {
  const estrellas = ratingToStars(rating)
  const llenas = Math.floor(estrellas)
  const tieneMedia = estrellas % 1 !== 0

  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-star', className)}
      role="img"
      aria-label={`${estrellas} de 5 estrellas`}
    >
      {Array.from({ length: 5 }, (_, i) => {
        if (i < llenas) {
          return <Star key={i} size={size} aria-hidden fill="currentColor" strokeWidth={0} />
        }
        if (i === llenas && tieneMedia) {
          return (
            <span key={i} className="relative inline-flex" aria-hidden>
              <Star size={size} strokeWidth={1.5} className="text-muted-foreground" />
              <StarHalf
                size={size}
                fill="currentColor"
                strokeWidth={0}
                className="absolute inset-0"
              />
            </span>
          )
        }
        return (
          <Star
            key={i}
            size={size}
            aria-hidden
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
        )
      })}
    </span>
  )
}
