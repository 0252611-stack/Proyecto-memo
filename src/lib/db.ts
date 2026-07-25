import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

// Next.js recarga los módulos en desarrollo, así que el cliente se guarda en el objeto
// global para no abrir una conexión nueva en cada recarga.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('Falta DATABASE_URL. Copia .env.example a .env.')
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
