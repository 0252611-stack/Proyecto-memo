import 'dotenv/config'

// El entorno de desarrollo bloquea musicbrainz.org y las APIs de Spotify a nivel de red,
// y una suite que depende de la red es una suite que falla por razones ajenas al código.
// Cualquier prueba que necesite una respuesta HTTP debe usar un fixture y sustituir fetch
// explícitamente; si algo se escapa, este guard lo convierte en un fallo legible.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(
    `Las pruebas no pueden salir a la red. Se intentó llamar a: ${String(input)}. ` +
      'Usa un fixture y sustituye fetch con vi.stubGlobal.',
  )
}) as typeof fetch
