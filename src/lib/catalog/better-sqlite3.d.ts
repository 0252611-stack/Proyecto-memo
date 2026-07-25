// `better-sqlite3` no publica tipos propios y no hay `@types/better-sqlite3` instalado.
// Esta declaración ambiental cubre únicamente lo que usan las pruebas de este módulo
// (levantar una base de datos temporal y aplicarle las migraciones reales del proyecto).
declare module 'better-sqlite3' {
  export default class Database {
    constructor(filename: string, options?: unknown)
    exec(sql: string): this
    close(): void
  }
}
