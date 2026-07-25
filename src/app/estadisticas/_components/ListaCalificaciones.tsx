import { SinDatos } from '@/components/Panel'
import { Estrellas } from '@/components/ui/Estrellas'

export interface FilaCalificacion {
  id: string
  nombre: string
  averageRating: number
  averageStars: number
  reviewCount: number
}

/**
 * Lista de calificación media (por artista o por género), con la cantidad de reseñas
 * que la sustentan: un promedio de una sola reseña no pesa lo mismo que uno de diez, y
 * ocultarlo invitaría a leer más certeza de la que hay.
 */
export function ListaCalificaciones({
  items,
  vacio,
}: {
  items: FilaCalificacion[]
  vacio: string
}) {
  if (items.length === 0) {
    return <SinDatos>{vacio}</SinDatos>
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3">
          <span
            className="min-w-0 flex-1 truncate text-sm text-foreground"
            title={item.nombre}
          >
            {item.nombre}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Estrellas rating={item.averageRating} size={14} />
            <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {item.averageStars.toFixed(1)}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              ({item.reviewCount})
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
