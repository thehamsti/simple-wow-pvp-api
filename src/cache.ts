import { Database } from 'bun:sqlite'

interface CacheEntry {
  key: string
  value: string
  expires_at: number
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
        expires_at INTEGER NOT NULL
      )
    `)
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_expires_at ON cache(expires_at)')
  }

  get(key: string): any | null {
    const row = this.db.query<CacheEntry, string>('SELECT value, expires_at FROM cache WHERE key = ?').get(key)
    
    if (!row) {
      return null
    }

    if (Date.now() > row.expires_at) {
      this.delete(key)
      return null
    }

    return JSON.parse(row.value)
  }

  set(key: string, value: any, ttlSeconds: number = 300) {
    const expiresAt = Date.now() + (ttlSeconds * 1000)
    const jsonValue = JSON.stringify(value)
    
    this.db.run(
      'INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)',
      [key, jsonValue, expiresAt]
    )
  }

  delete(key: string) {
    this.db.run('DELETE FROM cache WHERE key = ?', [key])
  }

  cleanup() {
    this.db.run('DELETE FROM cache WHERE expires_at < ?', [Date.now()])
  }

  close() {
    this.db.close()
  }
}

export const cache = new CharacterCache()

setInterval(() => {
  cache.cleanup()
}, 60000)
