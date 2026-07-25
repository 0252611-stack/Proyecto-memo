'use client'

import { useActionState, useId, useState } from 'react'
import { SelectorEstrellas } from '@/components/ui/SelectorEstrellas'
import { cn } from '@/lib/cn'
import { crearResena, valoresIniciales, type EstadoFormularioResena } from './acciones'
import type { OpcionAlbum, OpcionCancion } from './consultas'

const estadoInicial: EstadoFormularioResena = { error: null, valores: valoresIniciales }

export function FormularioResena({
  albumes,
  canciones,
  className,
}: {
  albumes: OpcionAlbum[]
  canciones: OpcionCancion[]
  className?: string
}) {
  const [estado, accion, enviando] = useActionState(crearResena, estadoInicial)
  const [tipo, setTipo] = useState<'ALBUM' | 'TRACK'>(estado.valores.tipo)
  const idError = useId()

  const calificacionInicial = Number(estado.valores.rating)

  return (
    <form action={accion} className={cn('space-y-6', className)} noValidate>
      {estado.error && (
        <p
          id={idError}
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {estado.error}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">¿Qué vas a reseñar?</legend>
        <div className="flex gap-4">
          <label className="objetivo-tactil inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="tipo"
              value="ALBUM"
              checked={tipo === 'ALBUM'}
              onChange={() => setTipo('ALBUM')}
              className="h-4 w-4 accent-accent"
            />
            Álbum
          </label>
          <label className="objetivo-tactil inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="tipo"
              value="TRACK"
              checked={tipo === 'TRACK'}
              onChange={() => setTipo('TRACK')}
              className="h-4 w-4 accent-accent"
            />
            Canción
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cn('space-y-1', tipo !== 'ALBUM' && 'opacity-50')}>
          <label htmlFor="albumId" className="block text-sm font-medium text-foreground">
            Álbum
          </label>
          <select
            id="albumId"
            name="albumId"
            defaultValue={estado.valores.albumId}
            disabled={tipo !== 'ALBUM'}
            className="objetivo-tactil w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
          >
            <option value="">Elige un álbum…</option>
            {albumes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.artista} — {a.titulo}
              </option>
            ))}
          </select>
        </div>

        <div className={cn('space-y-1', tipo !== 'TRACK' && 'opacity-50')}>
          <label htmlFor="trackId" className="block text-sm font-medium text-foreground">
            Canción
          </label>
          <select
            id="trackId"
            name="trackId"
            defaultValue={estado.valores.trackId}
            disabled={tipo !== 'TRACK'}
            className="objetivo-tactil w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
          >
            <option value="">Elige una canción…</option>
            {canciones.map((t) => (
              <option key={t.id} value={t.id}>
                {t.artista} — {t.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <span className="block text-sm font-medium text-foreground">Calificación</span>
        <SelectorEstrellas
          name="rating"
          defaultValue={Number.isFinite(calificacionInicial) ? calificacionInicial : undefined}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm font-medium text-foreground">
          Título de la reseña
        </label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={estado.valores.title}
          maxLength={200}
          className="objetivo-tactil w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="body" className="block text-sm font-medium text-foreground">
          Reseña
        </label>
        <textarea
          id="body"
          name="body"
          rows={6}
          defaultValue={estado.valores.body}
          maxLength={20_000}
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="context" className="block text-sm font-medium text-foreground">
          Contexto (dónde y cómo la escuchaste)
        </label>
        <input
          id="context"
          name="context"
          type="text"
          defaultValue={estado.valores.context}
          maxLength={500}
          placeholder="En el coche, camino al trabajo…"
          className="objetivo-tactil w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="listenedOn" className="block text-sm font-medium text-foreground">
          Fecha en que la escuchaste
        </label>
        <input
          id="listenedOn"
          name="listenedOn"
          type="date"
          defaultValue={estado.valores.listenedOn}
          className="objetivo-tactil w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground sm:w-56"
        />
      </div>

      <label className="objetivo-tactil inline-flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="isFavorite"
          defaultChecked={estado.valores.isFavorite}
          className="h-4 w-4 accent-accent"
        />
        Marcar como favorita
      </label>

      <button
        type="submit"
        disabled={enviando}
        aria-describedby={estado.error ? idError : undefined}
        className="objetivo-tactil inline-flex items-center rounded-lg bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:opacity-90 disabled:opacity-60"
        style={{ transitionDuration: 'var(--duracion-rapida)' }}
      >
        {enviando ? 'Guardando…' : 'Guardar reseña'}
      </button>
    </form>
  )
}
