import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { EquipmentService } from '../services/equipment-service'
import { cacheMetaToResponse } from '../utils/cache'
import { ok, handleError } from '../utils/http'

export const EquipmentItemSchema = z.object({
  slot: z.string(),
  itemId: z.number(),
  name: z.string(),
  quality: z.string(),
  level: z.number(),
  enchantments: z.array(z.string()),
  gems: z.array(z.number()),
  bonus: z.string().optional()
})

const CacheInfoSchema = z.object({
  key: z.string(),
  expiresAt: z.string().nullable(),
  ttlMs: z.number(),
  ageMs: z.number().nullable()
})

export const EquipmentResponseSchema = z.object({
  data: z.object({
    averageItemLevel: z.number().nullable(),
    equippedItemLevel: z.number().nullable(),
    items: z.array(EquipmentItemSchema)
  }),
  meta: z.object({
    cached: z.boolean(),
    region: z.enum(SUPPORTED_REGIONS),
    cache: CacheInfoSchema.optional()
  })
})

const equipmentRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/equipment',
  tags: ['characters'],
  summary: 'Get character equipment',
  description: 'Returns equipped items with item level, enchants, and gems',
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
      description: 'Character equipment',
      content: {
        'application/json': {
          schema: EquipmentResponseSchema
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

export interface EquipmentRouteDeps {
  equipmentService: EquipmentService
}

export function registerEquipmentRoutes(app: OpenAPIHono, deps: EquipmentRouteDeps) {
  app.openapi(equipmentRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale } = c.req.valid('query')

      const result = await deps.equipmentService.getEquipment(
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
