import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { MythicPlusLeaderboardService } from '../services/mythic-plus-leaderboard-service'
import { cacheMetaToResponse } from '../utils/cache'
import { ok, handleError } from '../utils/http'

const RoleEnum = z.enum(['tank', 'healer', 'dps'])
const FactionEnum = z.enum(['alliance', 'horde'])
const ModeEnum = z.enum(['overall', 'class', 'dungeon'])

const LeaderboardMemberSchema = z.object({
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
  role: RoleEnum.nullable(),
  faction: FactionEnum.nullable()
})

const AffixSchema = z.object({
  id: z.number().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable().optional()
})

const LeaderboardEntrySchema = z.object({
  rank: z.number().nullable(),
  percentile: z.number().nullable(),
  mythicRating: z.number().nullable(),
  keystoneLevel: z.number().nullable(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  time: z.object({
    formatted: z.string().nullable(),
    seconds: z.number().nullable()
  }),
  dungeon: z.object({
    id: z.number().nullable(),
    name: z.string().nullable(),
    slug: z.string().nullable()
  }),
  affixes: z.array(AffixSchema),
  members: z.array(LeaderboardMemberSchema)
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

const LeaderboardSchema = z.object({
  id: z.string(),
  name: z.string().nullable()
})

const FiltersSchema = z.object({
  region: z.enum(SUPPORTED_REGIONS),
  class: z.string().nullable(),
  spec: z.string().nullable(),
  connectedRealmId: z.number().nullable(),
  dungeonId: z.number().nullable(),
  periodId: z.number().nullable(),
  role: RoleEnum.nullable(),
  faction: FactionEnum.nullable(),
  requested: z
    .object({
      class: z.string().optional(),
      spec: z.string().optional(),
      connectedRealmId: z.number().optional(),
      dungeonId: z.number().optional(),
      periodId: z.number().optional(),
      role: z.string().optional(),
      faction: z.string().optional()
    })
    .optional()
})

const MythicPlusLeaderboardResponseSchema = z.object({
  data: z.object({
    leaderboard: LeaderboardSchema,
    season: SeasonSchema,
    mode: ModeEnum,
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
    availableClasses: z.array(
      z.object({
        class: z.string(),
        specs: z.array(z.string())
      })
    ),
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

const intParam = z
  .string()
  .optional()
  .transform((value) => (value == null || value === '' ? undefined : Number(value)))
  .refine(
    (value) => value === undefined || (Number.isInteger(value) && value > 0),
    'Value must be a positive integer'
  )

const MythicPlusLeaderboardRoute = createRoute({
  method: 'get',
  path: '/{gameId}/leaderboards/mythic-plus',
  tags: ['leaderboards'],
  summary: 'Mythic+ leaderboards',
  description:
    'Returns paginated Mythic+ leaderboard data for the current season, supporting class and dungeon leaderboards.',
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES)
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US'),
      seasonId: intParam,
      type: ModeEnum.optional(),
      class: z.string().optional(),
      spec: z.string().optional(),
      connectedRealmId: intParam,
      dungeonId: intParam,
      periodId: intParam,
      role: z.string().optional(),
      faction: z.string().optional(),
      limit: limitParam,
      cursor: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Mythic+ leaderboard page',
      content: {
        'application/json': {
          schema: MythicPlusLeaderboardResponseSchema
        }
      }
    },
    400: { description: 'Invalid parameters' },
    404: { description: 'Leaderboard not found' },
    500: { description: 'Server error' }
  }
})

export interface MythicPlusLeaderboardRouteDeps {
  mythicPlusLeaderboardService: MythicPlusLeaderboardService
}

export function registerMythicPlusLeaderboardRoutes(
  app: OpenAPIHono,
  deps: MythicPlusLeaderboardRouteDeps
) {
  app.openapi(MythicPlusLeaderboardRoute, async (c) => {
    try {
      const { gameId } = c.req.valid('param')
      const query = c.req.valid('query')

      const mode = resolveMode(query)

      const result = await deps.mythicPlusLeaderboardService.getLeaderboard(
        gameId,
        query.region,
        query.locale,
        {
          seasonId: query.seasonId,
          cursor: query.cursor,
          limit: query.limit,
          classSlug: query.class,
          specSlug: query.spec,
          connectedRealmId: query.connectedRealmId,
          dungeonId: query.dungeonId,
          periodId: query.periodId,
          role: query.role,
          faction: query.faction,
          mode
        }
      )

      return ok(c, {
        data: {
          leaderboard: result.value.leaderboard,
          season: result.value.season,
          mode: result.value.mode,
          entries: result.value.entries
        },
        meta: {
          game: gameId,
          region: query.region,
          total: result.value.total,
          returned: result.value.entries.length,
          pagination: result.value.pagination,
          filters: result.value.filters,
          updatedAt: result.value.updatedAt,
          availableClasses: result.value.availableClasses,
          cached: result.cacheMeta.cached,
          cache: cacheMetaToResponse(result.cacheMeta)
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })
}

function resolveMode(query: z.infer<(typeof MythicPlusLeaderboardRoute)['request']['query']>) {
  if (query.type) {
    return query.type
  }
  if (query.class || query.spec) {
    return 'class'
  }
  if (query.connectedRealmId || query.dungeonId) {
    return 'dungeon'
  }
  return 'overall'
}
