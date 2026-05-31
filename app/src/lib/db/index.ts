import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { hashSync } from 'bcryptjs'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'osint.db')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
// Set busy_timeout FIRST: the `journal_mode = WAL` pragma below itself takes a
// write lock, so the timeout must already be in effect or parallel imports
// (e.g. Next.js collecting page data across routes during build) throw SQLITE_BUSY.
sqlite.pragma('busy_timeout = 15000')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Bootstrap tables and initial admin user
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
  // OR IGNORE guards against a race when multiple connections bootstrap a fresh
  // DB at once (parallel route imports during build) and the UNIQUE username collides.
  const info = sqlite
    .prepare(
      'INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, adminUsername, hash, 'admin', Math.floor(Date.now() / 1000))
  if (info.changes > 0) console.log(`[db] Created admin user: ${adminUsername}`)
}
