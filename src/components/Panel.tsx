import { cn } from '@/lib/cn'

/** Contenedor de sección con título. */
export function Panel({
  titulo,
  accion,
  children,
  className,
}: {
  titulo: string
  accion?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface p-5', className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg text-foreground">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

/** Mensaje para cuando una sección no tiene datos todavía. */
export function SinDatos({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

/** Cifra grande con su etiqueta, para la fila de totales. */
export function Cifra({
  valor,
  etiqueta,
}: {
  valor: string | number
  etiqueta: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="font-display text-2xl text-foreground tabular-nums">{valor}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{etiqueta}</div>
    </div>
  )
}

/**
 * Barra de proporción para rankings y distribuciones.
 *
 * El valor va también como texto: una barra sin número obliga a estimar a ojo, y quien
 * usa lector de pantalla no la percibe en absoluto.
 */
export function BarraProporcion({
  etiqueta,
  valor,
  maximo,
  sufijo = '',
  color,
}: {
  etiqueta: string
  valor: number
  maximo: number
  sufijo?: string
  color?: string | null
}) {
  const porcentaje = maximo > 0 ? Math.round((valor / maximo) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm text-foreground" title={etiqueta}>
        {etiqueta}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${porcentaje}%`, backgroundColor: color ?? 'var(--color-accent)' }}
        />
      </span>
      <span className="w-14 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {valor}
        {sufijo}
      </span>
    </div>
  )
}
