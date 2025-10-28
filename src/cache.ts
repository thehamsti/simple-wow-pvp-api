import { Database } from 'bun:sqlite'
import { metrics } from './metrics'

interface CacheEntryRow {
  key: string
  value: string
  expires_at: number
  ttl_ms: number
}

class CharacterCache {
  private db: Database

  constructor(dbPath: string = 'pvp_cache.db') {
    this.db = new Database(dbPath)
    this.initTable()
  }

  private initTable() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        ttl_ms INTEGER NOT NULL DEFAULT 0
      )
    `)

    this.db.run('CREATE INDEX IF NOT EXISTS idx_expires_at ON cache(expires_at)')

    const columns = this.db.query<{ name: string }>('PRAGMA table_info(cache)').all()
    const hasTtlColumn = columns.some((col) => col.name === 'ttl_ms')
    if (!hasTtlColumn) {
      this.db.run('ALTER TABLE cache ADD COLUMN ttl_ms INTEGER NOT NULL DEFAULT 0')
    }
  }

  getEntry<T = any>(key: string): { value: T; expiresAt: number; ttlMs: number } | null {
    const row = this.db
      .query<CacheEntryRow, string>('SELECT value, expires_at, ttl_ms FROM cache WHERE key = ?')
      .get(key)

    if (!row) {
      return null
    }

    if (Date.now() > row.expires_at) {
      this.delete(key)
      metrics.increment('cache_misses_total', 1, { prefix: this.extractPrefix(key) })
      return null
    }

    metrics.increment('cache_hits_total', 1, { prefix: this.extractPrefix(key) })

    return {
      value: JSON.parse(row.value) as T,
      expiresAt: row.expires_at,
      ttlMs: row.ttl_ms
    }
  }

  get<T = any>(key: string): T | null {
    const entry = this.getEntry<T>(key)
    return entry ? entry.value : null
  }

  set(key: string, value: any, ttlSeconds: number = 300) {
    const ttlMs = Math.max(ttlSeconds, 1) * 1000
    const expiresAt = Date.now() + ttlMs
    const jsonValue = JSON.stringify(value)

    this.db.run(
      'INSERT OR REPLACE INTO cache (key, value, expires_at, ttl_ms) VALUES (?, ?, ?, ?)',
      [key, jsonValue, expiresAt, ttlMs]
    )
  }

  delete(key: string) {
    this.db.run('DELETE FROM cache WHERE key = ?', [key])
  }

  cleanup() {
    this.db.run('DELETE FROM cache WHERE expires_at < ?', [Date.now()])
    metrics.increment('cache_cleanup_total')
  }

  list(options: { prefix?: string; limit?: number; includeValue?: boolean } = {}) {
    const { prefix, limit = 100, includeValue = false } = options
    const normalizedLimit = Math.max(1, Math.floor(limit))
    const likePattern = prefix ? `${prefix}%` : '%'

    const rows = this.db
      .query<CacheEntryRow, string>(
        `SELECT key, value, expires_at, ttl_ms
         FROM cache
         WHERE key LIKE ?
         ORDER BY expires_at DESC
         LIMIT ${normalizedLimit}`
      )
      .all(likePattern)

    const encoder = new TextEncoder()

    return rows.map((row) => ({
      key: row.key,
      expiresAt: row.expires_at,
      ttlMs: row.ttl_ms,
      value: includeValue ? JSON.parse(row.value) : undefined,
      sizeBytes: encoder.encode(row.value).length
    }))
  }

  stats() {
    const total = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM cache').get()
    const expired = this.db
      .query<{ count: number }, number>('SELECT COUNT(*) as count FROM cache WHERE expires_at < ?')
      .get(Date.now())
    return {
      total: total?.count ?? 0,
      expired: expired?.count ?? 0,
      active: Math.max((total?.count ?? 0) - (expired?.count ?? 0), 0)
    }
  }

  close() {
    this.db.close()
  }

  private extractPrefix(key: string) {
    const idx = key.indexOf(':')
    return idx === -1 ? key : key.slice(0, idx)
  }
}

export const cache = new CharacterCache()

setInterval(() => {
  cache.cleanup()
}, 60000)
