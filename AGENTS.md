<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Memo

Diario musical personal: catálogo de artistas, álbumes y canciones por géneros,
registro de escuchas y reseñas de canciones y LPs. Un solo usuario.

Diseño completo: `docs/specs/2026-07-25-memo-design.md`.
Sistema visual: `design-system/memo/MASTER.md`.

## Idioma

Todo el código, los comentarios, los mensajes de commit y el texto de la interfaz van
en español. Los nombres de los modelos de Prisma están en inglés porque son el esquema
de datos, pero el resto no.

## Cambios de Next.js 16 que aplican aquí

- `params` y `searchParams` son **asíncronos**: hay que hacerles `await`. El acceso
  síncrono se eliminó por completo en la versión 16.
- Usa los tipos `PageProps<'/ruta'>` y `LayoutProps<'/ruta'>`, que genera
  `npx next typegen`, en lugar de escribir las props a mano.
- Turbopack es el empaquetador por omisión.
- `middleware` se llama ahora `proxy`.

## Límites del código

Las rutas y los componentes **nunca** hablan con Prisma ni con `fetch` directamente.
Todo pasa por `src/lib/`:

| Módulo | Responsabilidad |
|---|---|
| `src/lib/schemas.ts` | Única fuente de verdad de los valores permitidos y la validación |
| `src/lib/db.ts` | Cliente Prisma |
| `src/lib/catalog/` | MusicBrainz e importación al catálogo |
| `src/lib/reviews/` | Reseñas |
| `src/lib/listens/` | Registro de escuchas |
| `src/lib/stats/` | Agregaciones para el panel |
| `src/lib/spotify/` | OAuth y sincronización de reproducciones |

SQLite no tiene enums: los conjuntos cerrados de valores viven en `schemas.ts` y se
validan con zod. Si un valor no está ahí, no existe.

## Accesibilidad

No son sugerencias, son requisitos que ya están cumplidos y no deben romperse:

- Contraste mínimo 4.5:1 en texto. `--color-secondary` **no** cumple como texto
  (2.39:1); para texto usa `--color-secondary-foreground`.
- Objetivos táctiles de 44×44 px como mínimo (utilidad `.objetivo-tactil`).
- Foco visible siempre: nunca elimines el `outline`.
- `prefers-reduced-motion` respetado en `globals.css`.
- Íconos SVG de `lucide-react`. Nunca emojis como íconos.

## Red

El entorno de desarrollo bloquea `musicbrainz.org` y las APIs de Spotify. Las pruebas
no pueden salir a la red: `vitest.setup.ts` lo impide a propósito. Toda integración
externa se prueba con fixtures y `fetch` inyectado.

## Comandos

```
npm run dev        # servidor de desarrollo
npm test           # pruebas
npm run db:migrate # migraciones
npm run db:seed    # datos semilla
npm run db:reset   # borra y reconstruye la base
```
