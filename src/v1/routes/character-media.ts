import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { CharacterMediaService } from '../services/character-media-service'
import { cacheMetaToResponse } from '../utils/cache'
import { ok, handleError } from '../utils/http'

const CharacterMediaAssetSchema = z.object({
  key: z.string(),
  value: z.string()
})

const CacheInfoSchema = z.object({
  key: z.string(),
  expiresAt: z.string().nullable(),
  ttlMs: z.number(),
  ageMs: z.number().nullable()
})

const CharacterMediaResponseSchema = z.object({
  data: z.object({
    avatar: z.string().nullable(),
    bust: z.string().nullable(),
    render: z.string().nullable(),
    mainRaw: z.string().nullable(),
    assets: z.array(CharacterMediaAssetSchema)
  }),
  meta: z.object({
    cached: z.boolean(),
    region: z.enum(SUPPORTED_REGIONS),
    cache: CacheInfoSchema.optional()
  })
})

const characterMediaRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/media',
  tags: ['characters'],
  summary: 'Get character media assets',
  description: 'Returns character media URLs including avatar, bust, and render assets.',
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
      description: 'Character media assets',
      content: {
        'application/json': {
          schema: CharacterMediaResponseSchema
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

export interface CharacterMediaRouteDeps {
  mediaService: CharacterMediaService
}

export function registerCharacterMediaRoutes(app: OpenAPIHono, deps: CharacterMediaRouteDeps) {
  app.openapi(characterMediaRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale } = c.req.valid('query')

      const result = await deps.mediaService.getCharacterMedia(
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
