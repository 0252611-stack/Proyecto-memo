'use client'

import { Plus } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { importarAlbum } from './acciones'

/**
 * El botón vive en su propio componente porque `useFormStatus` sólo informa del envío
 * cuando está dentro del `<form>`, no en el mismo componente que lo declara.
 *
 * Importar tarda: MusicBrainz limita a una petición por segundo y hay que pedir el
 * detalle del álbum. Sin señal de progreso la interfaz parecería colgada.
 */
function Boton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="objetivo-tactil inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      style={{ transitionDuration: 'var(--duracion-rapida)' }}
    >
      {pending ? (
        'Importando…'
      ) : (
        <>
          <Plus size={16} aria-hidden />
          Añadir
        </>
      )}
    </button>
  )
}

export function BotonImportar({ sourceId, titulo }: { sourceId: string; titulo: string }) {
  const [resultado, accion] = useActionState(importarAlbum, null)

  return (
    <div className="shrink-0 text-right">
      <form action={accion}>
        <input type="hidden" name="sourceId" value={sourceId} />
        <span className="sr-only">Añadir {titulo} al catálogo</span>
        <Boton />
      </form>
      {resultado?.error ? (
        <p role="alert" className="mt-1 max-w-xs text-xs text-destructive">
          {resultado.error}
        </p>
      ) : null}
    </div>
  )
}
