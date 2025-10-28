import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { PvpLeaderboardService } from '../services/pvp-leaderboard-service'
import { cacheMetaToResponse } from '../utils/cache'
import { ok, handleError } from '../utils/http'
import { listPvpBrackets } from '../utils/pvp-brackets'

const FactionEnum = z.enum(['alliance', 'horde'])

const LeaderboardCharacterSchema = z.object({
  id: z.number().nullable(),
  name: z.string().nullable(),
  realm: z.object({
    id: z.number().nullable(),
    name: z.string().nullable(),
    slug: z.string().nullable()
  }),
  class: z.object({
    id: z.number().nullable(),
    name: z.string().nullable(),
    slug: z.string().nullable()
  }),
  spec: z
    .object({
      id: z.number(),
      name: z.string().nullable(),
      slug: z.string().nullable()
    })
    .nullable(),
  faction: FactionEnum.nullable()
})

const LeaderboardEntrySchema = z.object({
  rank: z.number().nullable(),
  rating: z.number().nullable(),
  percentile: z.number().nullable(),
  character: LeaderboardCharacterSchema,
  statistics: z.object({
    won: z.number(),
    lost: z.number(),
    played: z.number(),
    winRate: z.number().nullable()
  })
})

const PaginationSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  cursor: z.string(),
  nextCursor: z.string().nullable(),
  previousCursor: z.string().nullable()
})

const SeasonSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable()
})

const BracketSchema = z.object({
  id: z.string(),
  name: z.string().nullable()
})

const FiltersSchema = z.object({
  region: z.enum(SUPPORTED_REGIONS),
  realm: z.string().nullable(),
  class: z.string().nullable(),
  spec: z.string().nullable(),
  faction: FactionEnum.nullable(),
  requested: z
    .object({
      realm: z.string().optional(),
      class: z.string().optional(),
      spec: z.string().optional(),
      faction: z.string().optional()
    })
    .optional()
})

const PvpLeaderboardResponseSchema = z.object({
  data: z.object({
    leaderboard: z.literal('pvp'),
    season: SeasonSchema,
    bracket: BracketSchema,
    entries: z.array(LeaderboardEntrySchema)
  }),
  meta: z.object({
    game: z.enum(SUPPORTED_GAMES),
    region: z.enum(SUPPORTED_REGIONS),
    total: z.number(),
    returned: z.number(),
    pagination: PaginationSchema,
    filters: FiltersSchema,
    updatedAt: z.string().nullable(),
    availableBrackets: z.array(z.string()),
    cached: z.boolean(),
    cache: z
      .object({
        key: z.string(),
        expiresAt: z.string().nullable(),
        ttlMs: z.number(),
        ageMs: z.number().nullable()
      })
      .nullable()
  })
})

const limitParam = z
  .string()
  .optional()
  .transform((value) => (value == null ? undefined : Number(value)))
  .refine(
    (value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= 200),
    'limit must be between 1 and 200'
  )

const PvpLeaderboardRoute = createRoute({
  method: 'get',
  path: '/{gameId}/leaderboards/pvp/{bracket}',
  tags: ['leaderboards'],
  summary: 'PvP leaderboards',
  description:
    'Returns paginated PvP leaderboard standings for the active season, including Solo Shuffle class/spec ladders.',
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES),
      bracket: z
        .string()
        .min(2)
        .openapi({
          description:
            'PvP bracket identifier (e.g. 2v2, 3v3, rbg, shuffle-overall, shuffle-druid-restoration).'
        })
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US'),
      seasonId: z
        .string()
        .optional()
        .transform((value) => (value == null ? undefined : Number(value)))
        .refine(
          (value) => value === undefined || (Number.isInteger(value) && value > 0),
          'seasonId must be a positive integer'
        ),
      limit: limitParam,
      cursor: z.string().optional(),
      realm: z.string().optional(),
      class: z.string().optional(),
      spec: z.string().optional(),
      faction: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'PvP leaderboard page',
      content: {
        'application/json': {
          schema: PvpLeaderboardResponseSchema,
          examples: {
            default: {
              summary: 'Example PvP leaderboard response',
              value: {
                data: {
                  leaderboard: 'pvp',
                  season: {
                    id: 37,
                    name: 'The War Within: Season 1',
                    slug: 'season-1-tww',
                    startsAt: '2025-09-17T00:00:00Z',
                    endsAt: null
                  },
                  bracket: { id: '2v2', name: '2v2' },
                  entries: []
                },
                meta: {
                  game: 'retail',
                  region: 'us',
                  total: 0,
                  returned: 0,
                  pagination: {
                    limit: 50,
                    offset: 0,
                    cursor: 'offset:0',
                    nextCursor: null,
                    previousCursor: null
                  },
                  filters: {
                    region: 'us',
                    realm: null,
                    class: null,
                    spec: null,
                    faction: null
                  },
                  updatedAt: null,
                  availableBrackets: listPvpBrackets(),
                  cached: false,
                  cache: null
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid parameters'
    },
    404: {
      description: 'Leaderboard not found'
    },
    500: {
      description: 'Server error'
    }
  }
})

export interface PvpLeaderboardRouteDeps {
  pvpLeaderboardService: PvpLeaderboardService
}

export function registerPvpLeaderboardRoutes(app: OpenAPIHono, deps: PvpLeaderboardRouteDeps) {
  app.openapi(PvpLeaderboardRoute, async (c) => {
    try {
      const { gameId, bracket } = c.req.valid('param')
      const {
        region,
        locale,
        seasonId,
        limit,
        cursor,
        realm,
        class: classFilter,
        spec,
        faction
      } = c.req.valid('query')

      const result = await deps.pvpLeaderboardService.getLeaderboard(gameId, region, locale, {
        bracket,
        seasonId,
        limit,
        cursor,
        filters: {
          realm: realm ?? undefined,
          class: classFilter ?? undefined,
          spec: spec ?? undefined,
          faction: faction ?? undefined
        }
      })

      return ok(c, {
        data: {
          leaderboard: 'pvp',
          season: result.value.season,
          bracket: result.value.bracket,
          entries: result.value.entries
        },
        meta: {
          game: gameId,
          region,
          total: result.value.total,
          returned: result.value.entries.length,
          pagination: result.value.pagination,
          filters: result.value.filters,
          updatedAt: result.value.updatedAt,
          availableBrackets: result.value.availableBrackets,
          cached: result.cacheMeta.cached,
          cache: cacheMetaToResponse(result.cacheMeta)
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })
}
