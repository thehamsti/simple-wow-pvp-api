import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { MythicPlusService } from '../services/mythic-plus-service'
import { cacheMetaToResponse } from '../utils/cache'
import { ok, handleError } from '../utils/http'

export const MythicPlusRunSchema = z.object({
  dungeon: z.string(),
  dungeonSlug: z.string().nullable(),
  level: z.number(),
  time: z.number().nullable(),
  completedAt: z.string().nullable(),
  score: z.number().nullable(),
  affixes: z.array(z.string())
})

export const MythicPlusDungeonScoreSchema = z.object({
  fortified: z.number().nullable().optional(),
  tyrannical: z.number().nullable().optional(),
  best: z.number().nullable().optional()
})

const CacheInfoSchema = z.object({
  key: z.string(),
  expiresAt: z.string().nullable(),
  ttlMs: z.number(),
  ageMs: z.number().nullable()
})

export const MythicPlusResponseSchema = z.object({
  data: z.object({
    currentScore: z.number().nullable(),
    previousScore: z.number().nullable(),
    bestRuns: z.array(MythicPlusRunSchema),
    dungeonScores: z.record(z.string(), MythicPlusDungeonScoreSchema)
  }),
  meta: z.object({
    cached: z.boolean(),
    region: z.enum(SUPPORTED_REGIONS),
    cache: CacheInfoSchema.optional()
  })
})

const mythicPlusRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/mythic-plus',
  tags: ['characters'],
  summary: 'Get character Mythic+ data',
  description:
    'Returns Mythic+ scores, best runs, and per-dungeon performance for the active season.',
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
      description: 'Character Mythic+ overview',
      content: {
        'application/json': {
          schema: MythicPlusResponseSchema
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

export interface MythicPlusRouteDeps {
  mythicPlusService: MythicPlusService
}

export function registerMythicPlusRoutes(app: OpenAPIHono, deps: MythicPlusRouteDeps) {
  app.openapi(mythicPlusRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale } = c.req.valid('query')

      const result = await deps.mythicPlusService.getMythicPlus(
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
