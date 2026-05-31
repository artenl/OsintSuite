import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { hashSync } from 'bcryptjs'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'osint.db')

let _db: BetterSQLite3Database<typeof schema> | null = null

// Lazy, one-time initialization. Critically, this does NOT run at module import
// time — it runs on the first actual DB access. That keeps `next build` (which
// imports every route module across parallel workers) from opening the SQLite
// file concurrently and throwing SQLITE_BUSY during page-data collection.
function init(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  // busy_timeout first: the WAL pragma itself takes a write lock.
  sqlite.pragma('busy_timeout = 15000')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      notes TEXT,
      data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      service TEXT NOT NULL UNIQUE,
      key_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS camera_catalog (
      id TEXT PRIMARY KEY,
      rank INTEGER NOT NULL,
      product TEXT NOT NULL,
      count INTEGER NOT NULL,
      query TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  const existing = sqlite.prepare('SELECT id FROM users WHERE role = ?').get('admin')
  if (!existing) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin'
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme'
    const hash = hashSync(adminPassword, 12)
    const id = crypto.randomUUID()
    const info = sqlite
      .prepare('INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, adminUsername, hash, 'admin', Math.floor(Date.now() / 1000))
    if (info.changes > 0) console.log(`[db] Created admin user: ${adminUsername}`)
  }

  _db = drizzle(sqlite, { schema })
  return _db
}

// Proxy that initializes on first property access and forwards everything to the
// real drizzle instance. Methods are bound so `this` stays correct.
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const real = init()
    const value = Reflect.get(real as object, prop)
    return typeof value === 'function' ? value.bind(real) : value
  },
})
