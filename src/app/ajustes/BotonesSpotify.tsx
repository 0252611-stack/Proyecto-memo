'use client'

import { Check, RefreshCw, Unlink } from 'lucide-react'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/cn'
import {
  desconectarSpotify,
  sincronizarSpotify,
  type ResultadoSincronizacion,
} from './acciones'

function Aviso({ resultado }: { resultado: ResultadoSincronizacion | null }) {
  if (!resultado) return null
  return (
    <p
      role="status"
      className={cn(
        'mt-3 flex items-start gap-1.5 text-sm',
        resultado.ok ? 'text-foreground' : 'text-destructive',
      )}
    >
      {resultado.ok ? <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /> : null}
      {resultado.mensaje}
    </p>
  )
}

export function BotonesSpotify() {
  const [resultado, setResultado] = useState<ResultadoSincronizacion | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => iniciar(async () => setResultado(await sincronizarSpotify()))}
          className="objetivo-tactil inline-flex items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ transitionDuration: 'var(--duracion-rapida)' }}
        >
          <RefreshCw size={16} aria-hidden className={pendiente ? 'animate-spin' : undefined} />
          {pendiente ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>

        {/* Desconectar pide confirmación: es destructivo y no hay forma de deshacerlo
            sin volver a pasar por el flujo de autorización de Spotify. */}
        {confirmando ? (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  setResultado(await desconectarSpotify())
                  setConfirmando(false)
                })
              }
              className="objetivo-tactil inline-flex items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-medium text-foreground disabled:opacity-60"
            >
              <Unlink size={16} aria-hidden />
              Sí, desconectar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="objetivo-tactil rounded-lg border border-border-strong px-4 text-sm text-foreground"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="objetivo-tactil inline-flex items-center gap-2 rounded-lg border border-border-strong px-4 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
            style={{ transitionDuration: 'var(--duracion-rapida)' }}
          >
            <Unlink size={16} aria-hidden />
            Desconectar
          </button>
        )}
      </div>
      <Aviso resultado={resultado} />
    </div>
  )
}
