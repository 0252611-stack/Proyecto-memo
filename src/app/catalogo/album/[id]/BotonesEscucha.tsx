'use client'

import { Check, Disc3, Play } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/cn'
import { registrarAlbumCompleto, registrarEscucha, type ResultadoEscucha } from './acciones'

/**
 * Botón que refleja que el envío está en curso.
 *
 * `useFormStatus` sólo funciona dentro del formulario, por eso vive en su propio
 * componente: si estuviera en el mismo que el `<form>`, devolvería siempre `pending`
 * en falso.
 */
function BotonEnviar({
  children,
  etiquetaPendiente,
  className,
  titulo,
}: {
  children: React.ReactNode
  etiquetaPendiente: string
  className?: string
  titulo?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title={titulo}
      aria-disabled={pending}
      className={cn(
        'objetivo-tactil inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-60',
        className,
      )}
      style={{ transitionDuration: 'var(--duracion-rapida)' }}
    >
      {pending ? etiquetaPendiente : children}
    </button>
  )
}

/** Aviso del resultado. `role="status"` hace que el lector de pantalla lo anuncie solo. */
function Aviso({ resultado }: { resultado: ResultadoEscucha | null }) {
  if (!resultado) return null
  return (
    <p
      role="status"
      className={cn(
        'mt-2 flex items-center gap-1.5 text-sm',
        resultado.ok ? 'text-accent' : 'text-destructive',
      )}
    >
      {resultado.ok ? <Check size={15} aria-hidden /> : null}
      {resultado.mensaje}
    </p>
  )
}

/** Registra la escucha de una canción suelta. */
export function BotonEscucharCancion({ trackId, titulo }: { trackId: string; titulo: string }) {
  const [resultado, accion] = useActionState(registrarEscucha, null)

  return (
    <form action={accion} className="shrink-0">
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="titulo" value={titulo} />
      <BotonEnviar
        etiquetaPendiente="…"
        titulo={`Registrar escucha de ${titulo}`}
        className="px-2 text-muted-foreground hover:text-accent"
      >
        <Play size={15} aria-hidden />
        <span className="sr-only">Registrar escucha de {titulo}</span>
        {resultado?.ok ? <Check size={15} aria-hidden className="text-accent" /> : null}
      </BotonEnviar>
      {resultado && !resultado.ok ? (
        <span role="status" className="sr-only">
          {resultado.mensaje}
        </span>
      ) : null}
    </form>
  )
}

/** Registra de golpe todas las canciones del álbum. */
export function BotonEscucharAlbum({ trackIds }: { trackIds: string[] }) {
  const [resultado, accion] = useActionState(registrarAlbumCompleto, null)

  if (trackIds.length === 0) return null

  return (
    <div>
      <form action={accion}>
        {trackIds.map((id) => (
          <input key={id} type="hidden" name="trackIds" value={id} />
        ))}
        <BotonEnviar
          etiquetaPendiente="Registrando…"
          className="border border-border-strong px-4 py-2.5 text-foreground hover:border-accent hover:text-accent"
        >
          <Disc3 size={16} aria-hidden />
          Escuché el álbum completo
        </BotonEnviar>
      </form>
      <Aviso resultado={resultado} />
    </div>
  )
}
