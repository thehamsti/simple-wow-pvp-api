import { Database } from 'bun:sqlite'

export type MetricType = 'counter' | 'gauge'

interface MetricDefinition {
  name: string
  type: MetricType
  help: string
  labels: string[]
}

interface MetricUpdate {
  labels?: Record<string, string>
  value?: number
}

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: 'bnet_requests_total',
    type: 'counter',
    help: 'Total Battle.net API requests',
    labels: ['status', 'operation']
  },
  {
    name: 'bnet_retry_total',
    type: 'counter',
    help: 'Total retries performed for Battle.net API requests',
    labels: ['operation']
  },
  {
    name: 'cache_hits_total',
    type: 'counter',
    help: 'Cache hits by cache key prefix',
    labels: ['prefix']
  },
  {
    name: 'cache_misses_total',
    type: 'counter',
    help: 'Cache misses by cache key prefix',
    labels: ['prefix']
  },
  {
    name: 'cache_cleanup_total',
    type: 'counter',
    help: 'Number of cache cleanup sweeps performed',
    labels: []
  }
]

type MetricsRow = {
  metric: string
  labels_hash: string
  labels_json: string
  value: number
  updated_at: number
}

export class MetricsRegistry {
  private db: Database

  constructor(dbPath: string = 'pvp_cache.db') {
    this.db = new Database(dbPath)
    this.initTables()
  }

  private initTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        metric TEXT NOT NULL,
        labels_hash TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        value REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(metric, labels_hash)
      )
    `)
  }

  private static hashLabels(labels: Record<string, string>) {
    return Object.keys(labels)
      .sort()
      .map((key) => `${key}=${labels[key]}`)
      .join('|')
  }

  private getDefinition(name: string) {
    const def = METRIC_DEFINITIONS.find((metric) => metric.name === name)
    if (!def) {
      throw new Error(`Metric ${name} is not defined`)
    }
    return def
  }

  increment(name: string, value = 1, labels: Record<string, string> = {}) {
    const def = this.getDefinition(name)
    const normalizedLabels = this.normalizeLabels(def, labels)
    const hash = MetricsRegistry.hashLabels(normalizedLabels)
    const now = Date.now()

    this.db.run(
      `INSERT INTO metrics (metric, labels_hash, labels_json, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(metric, labels_hash) DO UPDATE SET
         value = metrics.value + excluded.value,
         updated_at = excluded.updated_at`,
      [name, hash, JSON.stringify(normalizedLabels), value, now]
    )
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}) {
    const def = this.getDefinition(name)
    if (def.type !== 'gauge') {
      throw new Error(`${name} is not a gauge metric`)
    }
    const normalizedLabels = this.normalizeLabels(def, labels)
    const hash = MetricsRegistry.hashLabels(normalizedLabels)
    const now = Date.now()

    this.db.run(
      `INSERT INTO metrics (metric, labels_hash, labels_json, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(metric, labels_hash) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [name, hash, JSON.stringify(normalizedLabels), value, now]
    )
  }

  list() {
    return this.db
      .query<MetricsRow, undefined>('SELECT metric, labels_json, value, updated_at FROM metrics')
      .all(undefined)
      .map((row) => ({
        metric: row.metric,
        labels: JSON.parse(row.labels_json) as Record<string, string>,
        value: row.value,
        updatedAt: row.updated_at
      }))
  }

  private normalizeLabels(def: MetricDefinition, labels: Record<string, string>) {
    const normalized: Record<string, string> = {}
    for (const key of def.labels) {
      normalized[key] = labels[key] ?? 'unknown'
    }
    return normalized
  }
}

export const metrics = new MetricsRegistry()
