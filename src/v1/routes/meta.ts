import { createRoute, z, OpenAPIHono } from '@hono/zod-openapi'
import { ok, handleError } from '../utils/http'
import type { RealmService } from '../services/realm-service'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { cacheMetaToResponse } from '../utils/cache'

const gamesRoute = createRoute({
  method: 'get',
  path: '/games',
  tags: ['meta'],
  responses: {
    200: {
      description: 'Supported games',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(
              z.object({
                id: z.enum(SUPPORTED_GAMES),
                label: z.string(),
                timeline: z.string(),
                description: z.string()
              })
            )
          })
        }
      }
    }
  }
})

const regionsRoute = createRoute({
  method: 'get',
  path: '/regions',
  tags: ['meta'],
  responses: {
    200: {
      description: 'Supported regions',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(
              z.object({
                id: z.enum(SUPPORTED_REGIONS),
                label: z.string(),
                defaultLocale: z.string()
              })
            )
          })
        }
      }
    }
  }
})

const realmsRoute = createRoute({
  method: 'get',
  path: '/{gameId}/realms',
  tags: ['meta'],
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES)
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US')
    })
  },
  responses: {
    200: {
      description: 'List of realms for game/region',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(
              z.object({
                id: z.number(),
                slug: z.string(),
                name: z.string(),
                category: z.string().nullable(),
                localeName: z.string().nullable(),
                timezone: z.string().nullable(),
                type: z.string().nullable(),
                population: z.string().nullable()
              })
            ),
            meta: z.object({
              region: z.enum(SUPPORTED_REGIONS),
              locale: z.string()
            })
          })
        }
      }
    }
  }
})

export interface MetaRouteDeps {
  realmService: RealmService
}

export function registerMetaRoutes(app: OpenAPIHono, deps: MetaRouteDeps) {
  const metaApp = new OpenAPIHono()

  metaApp.openapi(gamesRoute, (c) => {
    const data = [
      {
        id: 'retail' as const,
        label: 'World of Warcraft (Retail)',
        timeline: 'Dragonflight / The War Within',
        description: 'Modern retail service with current expansions.'
      },
      {
        id: 'classic-era' as const,
        label: 'WoW Classic Era',
        timeline: 'Classic progression realms',
        description: 'Classic Era realms anchored in patch 1.14.'
      },
      {
        id: 'classic-wotlk' as const,
        label: 'WoW Classic Wrath',
        timeline: 'Wrath of the Lich King Classic',
        description: 'Classic realms targeting Wrath content.'
      },
      {
        id: 'classic-hc' as const,
        label: 'WoW Classic Hardcore',
        timeline: 'Hardcore Classic',
        description: 'Permadeath variant of Classic Era.'
      }
    ]

    return ok(c, { data })
  })

  metaApp.openapi(regionsRoute, (c) => {
    const data = [
      { id: 'us' as const, label: 'North America', defaultLocale: 'en_US' },
      { id: 'eu' as const, label: 'Europe', defaultLocale: 'en_GB' },
      { id: 'kr' as const, label: 'Korea', defaultLocale: 'ko_KR' },
      { id: 'tw' as const, label: 'Taiwan', defaultLocale: 'zh_TW' }
    ]

    return ok(c, { data })
  })

  metaApp.openapi(realmsRoute, async (c) => {
    try {
      const { gameId } = c.req.valid('param')
      const { region, locale } = c.req.valid('query')

      const result = await deps.realmService.listRealms(gameId, region, locale)
      return ok(c, {
        data: result.value,
        meta: {
          region,
          locale,
          cached: result.cacheMeta.cached,
          cache: cacheMetaToResponse(result.cacheMeta)
        }
      })
    } catch (error) {
      return handleError(c, error)
    }
  })

  app.route('/meta', metaApp)
}
