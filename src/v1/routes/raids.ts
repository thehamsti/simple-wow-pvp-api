import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { RaidService } from '../services/raid-service'
import { cacheMetaToResponse } from '../utils/cache'
import { ok, handleError } from '../utils/http'

export const RaidDifficultyProgressSchema = z.object({
  completed: z.number(),
  total: z.number(),
  percentage: z.number()
})

export const RaidBossKillInfoSchema = z.object({
  killed: z.boolean(),
  firstKill: z.string().nullable()
})

export const RaidBossSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
  normal: RaidBossKillInfoSchema.nullable(),
  heroic: RaidBossKillInfoSchema.nullable(),
  mythic: RaidBossKillInfoSchema.nullable()
})

export const RaidInstanceSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullable(),
  expansion: z.string().nullable(),
  progress: z.object({
    normal: RaidDifficultyProgressSchema.nullable(),
    heroic: RaidDifficultyProgressSchema.nullable(),
    mythic: RaidDifficultyProgressSchema.nullable()
  }),
  bosses: z.array(RaidBossSchema)
})

const CacheInfoSchema = z.object({
  key: z.string(),
  expiresAt: z.string().nullable(),
  ttlMs: z.number(),
  ageMs: z.number().nullable()
})

export const RaidProgressResponseSchema = z.object({
  data: z.object({
    raids: z.array(RaidInstanceSchema)
  }),
  meta: z.object({
    cached: z.boolean(),
    region: z.enum(SUPPORTED_REGIONS),
    cache: CacheInfoSchema.optional()
  })
})

const raidRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/raids',
  tags: ['characters'],
  summary: 'Get character raid progression',
  description: 'Returns raid completion statistics across difficulties and per-boss kill history.',
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES),
      realmSlug: z.string(),
      characterName: z.string()
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US')
    })
  },
  responses: {
    200: {
      description: 'Character raid progression',
      content: {
        'application/json': {
          schema: RaidProgressResponseSchema
        }
      }
    },
    404: {
      description: 'Character not found'
    },
    500: {
      description: 'Server error'
    }
  }
})

export interface RaidRouteDeps {
  raidService: RaidService
}

export function registerRaidRoutes(app: OpenAPIHono, deps: RaidRouteDeps) {
  app.openapi(raidRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale } = c.req.valid('query')

      const result = await deps.raidService.getRaidProgress(
        gameId,
        region,
        realmSlug,
        characterName,
        locale
      )

      return ok(c, {
        data: result.value,
        meta: {
          cached: result.cacheMeta.cached,
          region,
          cache: cacheMetaToResponse(result.cacheMeta)
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })
}
