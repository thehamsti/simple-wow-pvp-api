import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { CharacterService, CharacterSummary } from '../services/character-service'
import { ok, handleError, parseQueryParamList } from '../utils/http'
import { cacheMetaToResponse } from '../utils/cache'
import { ApiError } from '../utils/errors'

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional()
  })
})

export const CharacterSummaryDataSchema = z.object({
  name: z.string(),
  realm: z.string(),
  realmSlug: z.string(),
  level: z.number().nullable(),
  faction: z.string().nullable(),
  race: z.string().nullable(),
  characterClass: z.string().nullable(),
  activeSpec: z.string().nullable(),
  itemLevel: z
    .object({
      average: z.number().nullable(),
      equipped: z.number().nullable()
    })
    .nullable(),
  lastLoginTimestamp: z.number().nullable()
})

const CacheInfoSchema = z.object({
  key: z.string(),
  expiresAt: z.string().nullable(),
  ttlMs: z.number(),
  ageMs: z.number().nullable()
})

const CharacterSummaryResponseSchema = z.object({
  data: CharacterSummaryDataSchema.partial(),
  meta: z.object({
    requestedFields: z.array(z.string()),
    availableFields: z.array(z.string()),
    cached: z.boolean(),
    cache: CacheInfoSchema.optional()
  })
})

export const CharacterPvpDataSchema = z.object({
  season: z.array(
    z.object({
      bracket: z.string(),
      rating: z.number().nullable(),
      won: z.number(),
      lost: z.number(),
      played: z.number(),
      winRate: z.number().nullable()
    })
  ),
  honor: z
    .object({
      level: z.number().nullable(),
      honorableKills: z.number().nullable()
    })
    .nullable()
})

const CharacterPvpResponseSchema = z.object({
  data: CharacterPvpDataSchema,
  meta: z.object({
    brackets: z.array(z.string()),
    region: z.enum(SUPPORTED_REGIONS),
    cached: z.boolean(),
    cache: CacheInfoSchema.optional()
  })
})

const characterSummaryRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}',
  tags: ['characters'],
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES),
      realmSlug: z.string(),
      characterName: z.string()
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US'),
      fields: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Character summary',
      content: {
        'application/json': {
          schema: CharacterSummaryResponseSchema
        }
      }
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    },
    404: {
      description: 'Character not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    },
    500: {
      description: 'Downstream Battle.net error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

const characterPvpRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/pvp',
  tags: ['characters'],
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES),
      realmSlug: z.string(),
      characterName: z.string()
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US'),
      brackets: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Character PvP overview',
      content: {
        'application/json': {
          schema: CharacterPvpResponseSchema
        }
      }
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    },
    404: {
      description: 'Character or PvP data not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    },
    500: {
      description: 'Downstream Battle.net error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

export interface CharacterRouteDeps {
  characterService: CharacterService
}

export function registerCharacterRoutes(
  app: OpenAPIHono,
  deps: CharacterRouteDeps
) {
  app.openapi(characterSummaryRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale, fields } = c.req.valid('query')
      const requestedFields = parseQueryParamList(fields)

      const summaryResult = await deps.characterService.getCharacterSummary(
        gameId,
        region,
        realmSlug,
        characterName,
        locale
      )

      const summary = summaryResult.value
      const availableFields = Object.keys(summary)
      const invalidFields = requestedFields.filter((field) => !availableFields.includes(field))

      if (invalidFields.length > 0) {
        return handleError(
          c,
          new ApiError({
            status: 400,
            code: 'request:invalid_fields',
            message: `Unsupported fields requested: ${invalidFields.join(', ')}`,
            details: {
              invalidFields,
              availableFields
            }
          })
        ) as any
      }

      const data = filterSummaryFields(summary, requestedFields)

      return ok<Partial<CharacterSummary>>(c, {
        data,
        meta: {
          requestedFields,
          availableFields,
          cached: summaryResult.cacheMeta.cached,
          cache: cacheMetaToResponse(summaryResult.cacheMeta)
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })

  app.openapi(characterPvpRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale, brackets } = c.req.valid('query')

      const bracketList = parseQueryParamList(brackets)

      const pvpResult = await deps.characterService.getCharacterPvp(
        gameId,
        region,
        realmSlug,
        characterName,
        locale,
        bracketList.length ? bracketList : undefined
      )

      return ok(c, {
        data: pvpResult.value,
        meta: {
          brackets: pvpResult.value.season.map((entry) => entry.bracket),
          region,
          cached: pvpResult.cacheMeta.cached,
          cache: cacheMetaToResponse(pvpResult.cacheMeta)
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })
}

function filterSummaryFields(
  summary: CharacterSummary,
  fields: string[]
): Partial<CharacterSummary> {
  if (!fields.length) {
    return summary
  }

  const filtered: Partial<CharacterSummary> = {}
  for (const field of fields) {
    const key = field as keyof CharacterSummary
    if (Object.prototype.hasOwnProperty.call(summary, key)) {
      filtered[key] = summary[key]
    }
  }
  return filtered
}
