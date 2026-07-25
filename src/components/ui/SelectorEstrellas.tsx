'use client'

import { Star, StarHalf } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'

const VALORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // medias estrellas, 0.5 a 5

/**
 * Selector de calificación en medias estrellas.
 *
 * Está construido como un grupo de radios reales y no como una fila de divs con
 * onClick: así funciona con teclado (flechas), lo anuncian los lectores de pantalla y
 * se envía solo dentro de un formulario, sin necesidad de estado global.
 */
export function SelectorEstrellas({
  name = 'rating',
  defaultValue,
  className,
}: {
  name?: string
  defaultValue?: number
  className?: string
}) {
  const [valor, setValor] = useState(defaultValue ?? 0)
  const [previsualizado, setPrevisualizado] = useState<number | null>(null)
  const mostrado = previsualizado ?? valor

  return (
    <div
      className={cn('inline-flex flex-col gap-2', className)}
      onMouseLeave={() => setPrevisualizado(null)}
    >
      <div role="radiogroup" aria-label="Calificación" className="flex items-center">
        {VALORES.map((v) => {
          const esMedia = v % 2 === 1
          return (
            <label
              key={v}
              className={cn(
                'relative cursor-pointer',
                // Cada media estrella ocupa la mitad del ancho del ícono y se superpone
                // sobre la mitad correspondiente de la estrella completa.
                esMedia ? 'w-4 overflow-hidden' : 'w-4 -ml-4 pl-4',
                'h-8 flex items-center',
              )}
              onMouseEnter={() => setPrevisualizado(v)}
            >
              <input
                type="radio"
                name={name}
                value={v}
                checked={valor === v}
                onChange={() => setValor(v)}
                className="sr-only peer"
              />
              <span className="sr-only">{v / 2} estrellas</span>
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 transition-colors',
                  esMedia ? 'w-4 overflow-hidden' : 'w-8',
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent',
                )}
                style={{ transitionDuration: 'var(--duracion-rapida)' }}
              >
                {esMedia ? (
                  <StarHalf
                    size={32}
                    strokeWidth={0}
                    fill="currentColor"
                    className={mostrado >= v ? 'text-star' : 'text-muted'}
                  />
                ) : (
                  <Star
                    size={32}
                    strokeWidth={0}
                    fill="currentColor"
                    className={mostrado >= v ? 'text-star' : 'text-muted'}
                  />
                )}
              </span>
            </label>
          )
        })}
        <span className="ml-3 text-sm text-muted-foreground tabular-nums">
          {mostrado > 0 ? `${mostrado / 2} / 5` : 'Sin calificar'}
        </span>
      </div>
    </div>
  )
}
