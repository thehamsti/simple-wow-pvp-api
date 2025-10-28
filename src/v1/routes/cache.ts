import { createRoute, z, OpenAPIHono } from '@hono/zod-openapi'
import { cache } from '../../cache'
import { cacheMetaToResponse } from '../utils/cache'
import { ok } from '../utils/http'

const CacheEntrySchema = z.object({
  key: z.string(),
  expiresAt: z.string().nullable(),
  ttlMs: z.number(),
  ageMs: z.number().nullable(),
  expired: z.boolean(),
  sizeBytes: z.number(),
  value: z.unknown().optional()
})

const CacheListResponseSchema = z.object({
  data: z.array(CacheEntrySchema),
  meta: z.object({
    prefix: z.string().nullable(),
    limit: z.number(),
    total: z.number(),
    active: z.number(),
    expired: z.number()
  })
})

const CacheDetailResponseSchema = z.object({
  data: z.object({
    key: z.string(),
    value: z.unknown(),
    cache: z.object({
      key: z.string(),
      expiresAt: z.string().nullable(),
      ttlMs: z.number(),
      ageMs: z.number().nullable()
    })
  })
})

const CacheListRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['cache'],
  summary: 'List cache entries',
  description: 'Provides a paged list of cache entries with expiry metadata. Intended for diagnostics.',
  request: {
    query: z.object({
      prefix: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      includeValue: z
        .union([z.literal('true'), z.literal('false')])
        .optional()
        .default('false')
    })
  },
  responses: {
    200: {
      description: 'Cache entries',
      content: {
        'application/json': {
          schema: CacheListResponseSchema
        }
      }
    }
  }
})

const CacheDetailRoute = createRoute({
  method: 'get',
  path: '/{cacheKey}',
  tags: ['cache'],
  summary: 'Inspect a cache entry',
  description: 'Returns a cache entry by key if present and not expired.',
  request: {
    params: z.object({
      cacheKey: z.string()
    }),
    query: z.object({
      includeValue: z
        .union([z.literal('true'), z.literal('false')])
        .optional()
        .default('true')
    })
  },
  responses: {
    200: {
      description: 'Cache entry details',
      content: {
        'application/json': {
          schema: CacheDetailResponseSchema
        }
      }
    },
    404: {
      description: 'Cache entry not found'
    }
  }
})

export function registerCacheRoutes(app: OpenAPIHono) {
  const cacheApp = new OpenAPIHono()

  cacheApp.openapi(CacheListRoute, (c) => {
    const { prefix, limit, includeValue } = c.req.valid('query')
    const include = includeValue === 'true'

    const entries = cache.list({
      prefix,
      limit,
      includeValue: include
    })

    const now = Date.now()
    const data = entries.map((entry) => {
      const fetchedAt =
        entry.ttlMs > 0 && entry.expiresAt ? Math.max(entry.expiresAt - entry.ttlMs, 0) : null
      const ageMs = fetchedAt != null ? Math.max(now - fetchedAt, 0) : null
      const expired = entry.expiresAt < now

      return {
        key: entry.key,
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
        ttlMs: entry.ttlMs,
        ageMs,
        expired,
        sizeBytes: entry.sizeBytes,
        ...(include && { value: entry.value })
      }
    })

    const stats = cache.stats()

    return ok(c, {
      data,
      meta: {
        prefix: prefix ?? null,
        limit,
        total: stats.total,
        active: stats.active,
        expired: stats.expired
      }
    })
  })

  cacheApp.openapi(CacheDetailRoute, (c) => {
    const { cacheKey } = c.req.valid('param')
    const { includeValue } = c.req.valid('query')

    const entry = cache.getEntry(cacheKey)
    if (!entry) {
      return c.json({ error: { code: 'cache:not_found', message: 'Cache entry not found' } }, 404)
    }

    const value = includeValue === 'false' ? undefined : entry.value

    return ok(c, {
      data: {
        key: cacheKey,
        value: value ?? null,
        cache: cacheMetaToResponse({
          key: cacheKey,
          cached: entry.expiresAt > Date.now(),
          ttlMs: entry.ttlMs,
          expiresAt: entry.expiresAt,
          fetchedAt: entry.ttlMs ? Math.max(entry.expiresAt - entry.ttlMs, 0) : null,
          ageMs: entry.ttlMs ? Math.max(Date.now() - Math.max(entry.expiresAt - entry.ttlMs, 0), 0) : null
        })
      }
    })
  })

  app.route('/cache', cacheApp)
}
