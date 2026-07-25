import type { DateRange } from '@/lib/stats'

/** Identificadores de los rangos de fecha que ofrece el selector de /estadisticas. */
export type RangoId = '30' | '90' | 'ano' | 'todo'

export const RANGO_POR_DEFECTO: RangoId = '30'

export const RANGOS: { id: RangoId; etiqueta: string }[] = [
  { id: '30', etiqueta: 'Últimos 30 días' },
  { id: '90', etiqueta: 'Últimos 90 días' },
  { id: 'ano', etiqueta: 'Este año' },
  { id: 'todo', etiqueta: 'Todo el historial' },
]

function esRangoId(valor: string | undefined): valor is RangoId {
  return valor != null && RANGOS.some((r) => r.id === valor)
}

/**
 * Resuelve el parámetro `rango` de la URL a un id válido.
 *
 * `searchParams` puede traer un arreglo si la clave se repite en la URL; se toma el
 * primer valor. Cualquier valor desconocido cae al rango por defecto en lugar de
 * romper la página.
 */
export function resolverRangoId(valor: string | string[] | undefined): RangoId {
  const plano = Array.isArray(valor) ? valor[0] : valor
  return esRangoId(plano) ? plano : RANGO_POR_DEFECTO
}

/** Traduce un id de rango a fechas concretas para las consultas de src/lib/stats. */
export function rangoAFechas(id: RangoId, ahora: Date = new Date()): DateRange {
  switch (id) {
    case '30': {
      const from = new Date(ahora)
      from.setDate(from.getDate() - 30)
      return { from, to: ahora }
    }
    case '90': {
      const from = new Date(ahora)
      from.setDate(from.getDate() - 90)
      return { from, to: ahora }
    }
    case 'ano': {
      const from = new Date(ahora.getFullYear(), 0, 1)
      return { from, to: ahora }
    }
    case 'todo':
      return {}
  }
}
