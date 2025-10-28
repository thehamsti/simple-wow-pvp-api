import { cache } from '../../cache'

export interface CacheMeta {
  key: string
  cached: boolean
  ttlMs: number
  expiresAt: number | null
  fetchedAt: number | null
  ageMs: number | null
}

export interface CachedResult<T> {
  value: T
  cacheMeta: CacheMeta
}

export const CACHE_DURATIONS = {
  profile: 25 * 60 * 1000,
  equipment: 45 * 60 * 1000,
  media: 45 * 60 * 1000,
  mythicPlus: 12 * 60 * 1000,
  raids: 45 * 60 * 1000,
  pvp: 10 * 60 * 1000,
  realms: 45 * 60 * 1000,
  leaderboards: 15 * 60 * 1000
} as const

type CacheDurationKey = keyof typeof CACHE_DURATIONS

export function buildCacheKey(parts: string[]): string {
  return parts
    .map((part) =>
      part
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join(':')
}

interface CacheFetchOptions<T> {
  keyParts: string[]
  ttlMs?: number
  durationKey?: CacheDurationKey
  fetcher: () => Promise<T>
}

export async function getCachedValue<T>(options: CacheFetchOptions<T>): Promise<CachedResult<T>> {
  const { keyParts, fetcher } = options
  const ttlMs =
    options.ttlMs ??
    (options.durationKey ? CACHE_DURATIONS[options.durationKey] : CACHE_DURATIONS.profile)

  const normalizedTtl = Math.max(ttlMs, 1000)
  const key = buildCacheKey(keyParts)

  const entry = cache.getEntry<T>(key)
  if (entry) {
    const ttlMs = entry.ttlMs && entry.ttlMs > 0 ? entry.ttlMs : normalizedTtl
    const fetchedAt = ttlMs > 0 ? Math.max(entry.expiresAt - ttlMs, 0) : null
    const ageMs = fetchedAt != null ? Math.max(Date.now() - fetchedAt, 0) : null
    return {
      value: entry.value,
      cacheMeta: {
        key,
        cached: true,
        ttlMs,
        expiresAt: entry.expiresAt,
        fetchedAt,
        ageMs
      }
    }
  }

  const fetchedAt = Date.now()
  const value = await fetcher()
  const expiresAt = fetchedAt + normalizedTtl
  cache.set(key, value, Math.ceil(normalizedTtl / 1000))

  return {
    value,
    cacheMeta: {
      key,
      cached: false,
      ttlMs: normalizedTtl,
      expiresAt,
      fetchedAt,
      ageMs: 0
    }
  }
}

export function cacheMetaToResponse(meta: CacheMeta) {
  return {
    key: meta.key,
    expiresAt: meta.expiresAt ? new Date(meta.expiresAt).toISOString() : null,
    ttlMs: meta.ttlMs,
    ageMs: meta.ageMs
  }
}
