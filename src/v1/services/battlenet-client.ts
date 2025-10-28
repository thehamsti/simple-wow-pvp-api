import { ApiError } from '../utils/errors'
import { Region } from '../types'
import { metrics } from '../../metrics'

const MAX_FETCH_RETRIES = 2
const BASE_RETRY_DELAY_MS = 250
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

export interface FetchOptions {
  region: Region
  locale: string
  namespace?: string
  signal?: AbortSignal
}

export interface BattleNetClient {
  getAccessToken(region: Region): Promise<{ token: string; expiresAt: number | null }>
  fetchJson<T>(path: string, options: FetchOptions): Promise<T>
  getTokenCacheMeta(): Record<string, { expiresAt: number | null }>
}

export function createBattleNetClient(): BattleNetClient {
  const clientId = process.env.BATTLE_NET_CLIENT_ID
  const clientSecret = process.env.BATTLE_NET_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new ApiError({
      status: 500,
      code: 'bnet:credentials_missing',
      message: 'BATTLE_NET_CLIENT_ID and BATTLE_NET_CLIENT_SECRET must be configured'
    })
  }

  type TokenCacheEntry = {
    token: string
    expiresAt: number | null
  }

  const tokenCache = new Map<Region, TokenCacheEntry>()
  const pendingTokenRequests = new Map<Region, Promise<TokenCacheEntry>>()

  const oauthOrigin = (region: Region) => `https://${region}.battle.net`
  const apiOrigin = (region: Region) => `https://${region}.api.blizzard.com`

  async function requestAccessToken(region: Region): Promise<TokenCacheEntry> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const response = await executeWithRetry(
      async () => {
        const res = await fetch(`${oauthOrigin(region)}/oauth/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials'
        })

        if (!res.ok) {
          const body = await res.text()
          throw new ApiError({
            status: res.status,
            code: 'bnet:token_failed',
            message: `Failed to obtain Battle.net token (${res.status})`,
            details: { region, body }
          })
        }

        return res
      },
      { maxRetries: MAX_FETCH_RETRIES, operation: 'token' }
    )

    const data: { access_token: string; expires_in: number } = await response.json()
    const expiresAt = Date.now() + Math.max(data.expires_in - 60, 1) * 1000
    const entry: TokenCacheEntry = { token: data.access_token, expiresAt }
    tokenCache.set(region, entry)
    return entry
  }

  async function ensureAccessToken(region: Region): Promise<TokenCacheEntry> {
    const cached = tokenCache.get(region)
    if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) {
      return cached
    }

    const existingRequest = pendingTokenRequests.get(region)
    if (existingRequest) {
      return existingRequest
    }

    const request = requestAccessToken(region).finally(() => {
      pendingTokenRequests.delete(region)
    })
    pendingTokenRequests.set(region, request)
    return request
  }

  async function fetchJson<T>(path: string, options: FetchOptions): Promise<T> {
    const { region, locale, namespace, signal } = options
    const { token } = await ensureAccessToken(region)

    const resourceUrl = buildUrl(apiOrigin(region), path, { locale, namespace })

    return executeWithRetry(
      async () => {
        const response = await fetch(resourceUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal
        })

        if (!response.ok) {
          const body = await response.text()
          throw new ApiError({
            status: response.status,
            code: response.status === 404 ? 'bnet:not_found' : 'bnet:request_failed',
            message:
              response.status === 404
                ? 'Resource not found in Battle.net API'
                : `Battle.net API request failed (${response.status})`,
            details: {
              region,
              path,
              status: response.status,
              body
            }
          })
        }

        return response.json() as Promise<T>
      },
      { signal, operation: 'fetch' }
    )
  }

  function getTokenCacheMeta() {
    const meta: Record<string, { expiresAt: number | null }> = {}
    tokenCache.forEach((entry, region) => {
      meta[region] = { expiresAt: entry.expiresAt }
    })
    return meta
  }

  return {
    async getAccessToken(region: Region) {
      return ensureAccessToken(region)
    },
    fetchJson,
    getTokenCacheMeta
  }
}

interface BuildUrlOptions {
  locale?: string
  namespace?: string
}

function buildUrl(origin: string, path: string, options: BuildUrlOptions) {
  const url =
    path.startsWith('http://') || path.startsWith('https://')
      ? new URL(path)
      : new URL(path.startsWith('/') ? path : `/${path}`, origin)

  if (options.locale && !url.searchParams.has('locale')) {
    url.searchParams.set('locale', options.locale)
  }
  if (options.namespace && !url.searchParams.has('namespace')) {
    url.searchParams.set('namespace', options.namespace)
  }

  return url.toString()
}

interface RetryOptions {
  signal?: AbortSignal
  maxRetries?: number
  operation?: string
}

async function executeWithRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const { signal, maxRetries = MAX_FETCH_RETRIES, operation: opName = 'fetch' } = options
  let attempt = 0
  let lastError: unknown = null

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Operation aborted')
    }

    try {
      const result = await operation()
      metrics.increment('bnet_requests_total', 1, { status: 'success', operation: opName })
      return result
    } catch (error) {
      lastError = error
      if (signal?.aborted) {
        throw error
      }
      if (attempt >= maxRetries || !shouldRetryError(error)) {
        metrics.increment('bnet_requests_total', 1, {
          status: getErrorStatusLabel(error),
          operation: opName
        })
        throw error
      }
      const backoff = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), 2000)
      const jitter = Math.random() * 100
      await sleep(backoff + jitter)
      attempt += 1
      metrics.increment('bnet_retry_total', 1, { operation: opName })
    }
  }

  throw lastError
}

function shouldRetryError(error: unknown) {
  if (isAbortError(error)) {
    return false
  }
  if (error instanceof ApiError) {
    if (RETRYABLE_STATUS_CODES.has(error.status) || error.status >= 500) {
      return true
    }
    return false
  }
  if (error instanceof Error) {
    // Network/Fetch errors do not carry HTTP status but are safe to retry
    return true
  }
  return false
}

function isAbortError(error: unknown) {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  return error instanceof Error && error.name === 'AbortError'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorStatusLabel(error: unknown) {
  if (error instanceof ApiError) {
    return String(error.status)
  }
  return 'error'
}
