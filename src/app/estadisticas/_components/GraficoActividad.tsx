import { SinDatos } from '@/components/Panel'
import type { MonthlyActivityStat } from '@/lib/stats'

/** Etiqueta corta para el eje del gráfico, p. ej. "jul 26". */
function mesCorto(mes: string) {
  const [anio, m] = mes.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' }).format(
    new Date(anio, m - 1, 1),
  )
}

/** Etiqueta larga para la tabla accesible, p. ej. "julio de 2026". */
function mesLargo(mes: string) {
  const [anio, m] = mes.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(
    new Date(anio, m - 1, 1),
  )
}

const ANCHO_BARRA = 56
const ALTO_GRAFICO = 160

/**
 * Gráfico de barras verticales de actividad mensual, en SVG puro (sin librerías).
 *
 * El SVG es puramente decorativo (`aria-hidden`) y repite el número encima de cada
 * barra para quien sí lo ve: la altura sola obliga a estimar a ojo. La información
 * real para lectores de pantalla vive en la tabla oculta visualmente que la acompaña,
 * así que nadie depende únicamente del color o de la posición de una barra.
 */
export function GraficoActividad({ datos }: { datos: MonthlyActivityStat[] }) {
  if (datos.length === 0) {
    return <SinDatos>Todavía no hay escuchas registradas en este rango.</SinDatos>
  }

  const max = Math.max(...datos.map((d) => d.listenCount))
  const anchoTotal = datos.length * ANCHO_BARRA

  return (
    <div>
      <div className="overflow-x-auto" aria-hidden="true">
        <svg
          viewBox={`0 0 ${anchoTotal} ${ALTO_GRAFICO + 36}`}
          width={anchoTotal}
          height={ALTO_GRAFICO + 36}
          className="min-w-full"
        >
          {datos.map((d, i) => {
            const alto = Math.max(Math.round((d.listenCount / max) * (ALTO_GRAFICO - 20)), 2)
            const x = i * ANCHO_BARRA
            return (
              <g key={d.month}>
                <rect
                  x={x + 8}
                  y={ALTO_GRAFICO - alto}
                  width={ANCHO_BARRA - 16}
                  height={alto}
                  rx={3}
                  fill="var(--color-accent)"
                />
                <text
                  x={x + ANCHO_BARRA / 2}
                  y={ALTO_GRAFICO - alto - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] tabular-nums"
                >
                  {d.listenCount}
                </text>
                <text
                  x={x + ANCHO_BARRA / 2}
                  y={ALTO_GRAFICO + 18}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {mesCorto(d.month)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <table className="sr-only">
        <caption>Escuchas registradas por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Escuchas</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((d) => (
            <tr key={d.month}>
              <th scope="row">{mesLargo(d.month)}</th>
              <td>{d.listenCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
