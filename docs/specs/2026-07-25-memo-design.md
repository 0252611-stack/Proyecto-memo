# Memo — Diario musical con reseñas

**Fecha:** 2026-07-25
**Estado:** Diseño aprobado, en implementación

## Qué es

Aplicación web personal (un solo usuario) para llevar registro de la música que escucho,
con un catálogo de artistas, álbumes y canciones clasificados por géneros, y un sistema
de reseñas para canciones y LPs.

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Plataforma | Web app (Next.js 16, App Router) | Funciona en celular y escritorio, un solo despliegue |
| Catálogo | API externa (MusicBrainz) + captura manual | Evita capturar miles de registros a mano |
| Registro de escuchas | Spotify en vivo + registro manual | Automático donde se puede, manual como respaldo |
| Alcance | Un solo usuario | Sin gestión de cuentas ni permisos: todo el esfuerzo va a las funciones |
| Base de datos | SQLite vía Prisma | Cero infraestructura en desarrollo; migrable a PostgreSQL sin cambiar código de aplicación |

## Restricciones del entorno

El contenedor de desarrollo bloquea `musicbrainz.org` y las APIs de Spotify a nivel de
proxy de red. Consecuencias de diseño:

1. Todo acceso a red vive detrás de una interfaz (`MusicCatalogSource`, `SpotifyClient`),
   nunca en los componentes ni en las rutas directamente.
2. Las pruebas usan fixtures grabados, no la red.
3. La base de datos incluye datos semilla para que la aplicación sea funcional y
   demostrable sin conexión.

Esto no limita la app en producción: en tu máquina las integraciones funcionan normal.

## Modelo de datos

```
Artist ──< AlbumArtist >── Album ──< Track
   │                         │         │
   └──< ArtistGenre >── Genre ──< AlbumGenre / TrackGenre >
                                        │
Listen ──> Track                        │
Review ──> Album | Track  (exactamente uno)
```

**Entidades**

- `Artist` — nombre, mbid opcional, país, año de formación, imagen, biografía.
- `Album` — el LP. Título, tipo (LP/EP/Single/Compilación), fecha de lanzamiento, portada.
- `Track` — canción. Pertenece a un álbum (opcional: sencillos sueltos), duración, número de pista.
- `Genre` — nombre único + slug. Relación muchos-a-muchos con las tres entidades anteriores,
  porque un artista puede ser post-punk *y* shoegaze, y una canción puede diferir del
  género de su álbum.
- `Listen` — una reproducción. `playedAt`, `source` (MANUAL / SPOTIFY / IMPORT), `msPlayed`.
  Clave única sobre (trackId, playedAt) para que la sincronización sea idempotente.
- `Review` — reseña. Apunta a un álbum **o** a una canción, nunca a ambos ni a ninguno
  (restricción CHECK a nivel de base de datos, no sólo de aplicación).

**Calificación:** entero de 1 a 10, que la interfaz presenta como 0.5 a 5 estrellas.
Guardar medias estrellas como enteros evita aritmética de punto flotante en promedios
y ordenamientos.

**Campo `context`** en `Review`: dónde y cómo escuchaste el disco. Es lo que convierte
un catálogo en un diario.

## Arquitectura

```
src/
  app/              Rutas (App Router) y Server Actions
  components/       Componentes de interfaz
  lib/
    db.ts           Cliente Prisma (singleton)
    catalog/        MusicCatalogSource: MusicBrainz + implementación local
    spotify/        Cliente OAuth y sincronización de reproducciones
    reviews/        Lógica de reseñas y validación con zod
  design-system/    Tokens generados por ui-ux-pro-max
prisma/
  schema.prisma
  seed.ts
```

Regla de límites: las rutas y los componentes nunca hablan con Prisma ni con `fetch`
directamente. Pasan por los módulos de `lib/`, que son los únicos que conocen la
persistencia y la red. Así cada pieza se prueba de forma aislada.

## Sistema visual

Generado con `ui-ux-pro-max` para el perfil "music tracking + review":

- **Tipografía:** Righteous (títulos) / Poppins (texto)
- **Paleta oscura:** fondo `#0F0F23`, primario `#1E1B4B`, acento `#22C55E`
- **Estilo:** bloques geométricos, alto contraste, transiciones de 200-300 ms

Requisitos no negociables: contraste mínimo 4.5:1, objetivos táctiles de 44×44 px,
foco visible para navegación por teclado, `prefers-reduced-motion` respetado,
íconos SVG (Lucide) — nunca emojis como íconos.

## Alcance de la versión 1

**Incluye:** catálogo con búsqueda e importación, registro de escuchas manual y por
Spotify, reseñas de canciones y LPs, estadísticas (top artistas, distribución de
géneros, actividad por mes), estantería de portadas.

**Excluye deliberadamente (YAGNI):** perfiles públicos, funciones sociales, reseñas
versionadas por temporada, recomendaciones. Son ideas buenas, pero ninguna es necesaria
para que la aplicación cumpla su propósito.
