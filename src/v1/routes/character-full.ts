import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { CharacterFullService, CharacterFullSection, isCharacterFullSection } from '../services/character-full-service'
import { ok, handleError, parseQueryParamList } from '../utils/http'
import { ApiError } from '../utils/errors'
import { CharacterSummaryDataSchema, CharacterPvpDataSchema } from './characters'
import { EquipmentResponseSchema } from './equipment'
import { MythicPlusResponseSchema } from './mythic-plus'
import { RaidProgressResponseSchema } from './raids'

const CharacterFullSectionEnum = z.enum(['profile', 'equipment', 'mythicPlus', 'raids', 'pvp'])

const CharacterFullResponseSchema = z.object({
  data: z.object({
    profile: CharacterSummaryDataSchema.nullable().optional(),
    equipment: EquipmentResponseSchema.shape.data.nullable().optional(),
    mythicPlus: MythicPlusResponseSchema.shape.data.nullable().optional(),
    raids: RaidProgressResponseSchema.shape.data.nullable().optional(),
    pvp: CharacterPvpDataSchema.nullable().optional()
  }),
  meta: z.object({
    cached: z.boolean(),
    region: z.enum(SUPPORTED_REGIONS),
    requestedSections: z.array(CharacterFullSectionEnum),
    fulfilledSections: z.array(CharacterFullSectionEnum),
    failedSections: z.array(CharacterFullSectionEnum),
    upstreamCalls: z.number(),
    errors: z.array(
      z.object({
        section: CharacterFullSectionEnum,
        code: z.string(),
        message: z.string(),
        status: z.number(),
        details: z.record(z.string(), z.unknown()).optional()
      })
    )
  })
})

const characterFullRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/full',
  tags: ['characters'],
  summary: 'Get full character aggregate data',
  description:
    'Returns an aggregate payload combining profile, equipment, Mythic+, raids, and PvP data. Use the include query to select specific sections.',
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES),
      realmSlug: z.string(),
      characterName: z.string()
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US'),
      include: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Aggregate character payload',
      content: {
        'application/json': {
          schema: CharacterFullResponseSchema
        }
      }
    },
    400: {
      description: 'Invalid request'
    },
    500: {
      description: 'Server error'
    }
  }
})

export interface CharacterFullRouteDeps {
  fullService: CharacterFullService
}

const includeAliases: Record<string, CharacterFullSection> = {
  profile: 'profile',
  equipment: 'equipment',
  'mythic-plus': 'mythicPlus',
  mythicplus: 'mythicPlus',
  'mythic_plus': 'mythicPlus',
  raids: 'raids',
  raid: 'raids',
  pvp: 'pvp'
}

export function registerCharacterFullRoutes(app: OpenAPIHono, deps: CharacterFullRouteDeps) {
  app.openapi(characterFullRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale, include } = c.req.valid('query')

      const requested = parseQueryParamList(include)
      const normalized = requested
        .map((entry) => includeAliases[entry.trim().toLowerCase()])
        .filter((value): value is CharacterFullSection => Boolean(value))

      const invalid = requested.filter((entry) => !includeAliases[entry.trim().toLowerCase()])
      if (invalid.length > 0) {
        throw new ApiError({
          status: 400,
          code: 'request:invalid_sections',
          message: `Unsupported sections requested: ${invalid.join(', ')}`,
          details: { invalid }
        })
      }

      const sections = dedupeSections(normalized.filter(isCharacterFullSection))

      const result = await deps.fullService.getCharacterFull(
        gameId,
        region,
        realmSlug,
        characterName,
        locale,
        sections
      )

      const data: Record<string, unknown> = {}
      if (result.profile !== undefined) {
        data.profile = result.profile
      }
      if (result.equipment !== undefined) {
        data.equipment = result.equipment
      }
      if (result.mythicPlus !== undefined) {
        data.mythicPlus = result.mythicPlus
      }
      if (result.raids !== undefined) {
        data.raids = result.raids
      }
      if (result.pvp !== undefined) {
        data.pvp = result.pvp
      }

      return ok(c, {
        data,
        meta: {
          cached: false,
          region,
          requestedSections: result.requestedSections,
          fulfilledSections: result.fulfilledSections,
          failedSections: result.failedSections,
          upstreamCalls: result.fulfilledSections.length + result.failedSections.length,
          errors: result.errors
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })
}

function dedupeSections(sections: CharacterFullSection[]) {
  const seen = new Set<CharacterFullSection>()
  const unique: CharacterFullSection[] = []
  for (const section of sections) {
    if (!seen.has(section)) {
      seen.add(section)
      unique.push(section)
    }
  }
  return unique
}
