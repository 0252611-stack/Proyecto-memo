// Utilidad SOLO para pruebas: crea una base de datos SQLite temporal, le aplica las
// migraciones de Prisma y devuelve un cliente conectado a ella. Así las pruebas nunca
// tocan prisma/dev.db ni comparten estado entre archivos de prueba.
//
// No se importa desde código de producción: `listens.ts` recibe su cliente por
// inyección de dependencias (parámetro `db`, con el singleton de `@/lib/db` como valor
// por defecto), así que las pruebas pueden pasar el cliente de aquí sin tocar env vars
// globales ni depender de aislamiento de módulos entre archivos.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const prismaBin = path.join(repoRoot, 'node_modules/.bin/prisma')

export interface TestDb {
  prisma: PrismaClient
  cleanup: () => Promise<void>
}

/**
 * Crea una base de datos temporal en un directorio propio del sistema, aplica las
 * migraciones con `prisma migrate deploy` (apuntando `DATABASE_URL` a ese archivo) y
 * devuelve un `PrismaClient` listo para usar en pruebas.
 */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(path.join(tmpdir(), 'memo-test-'))
  const dbFile = path.join(dir, 'test.db')
  const url = `file:${dbFile}`

  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  })

  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })

  return {
    prisma: client,
    async cleanup() {
      await client.$disconnect()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
