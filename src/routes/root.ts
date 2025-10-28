import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'

export const rootRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['legacy'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            query_parameters: z.object({
              region: z.string(),
              locale: z.string(),
              fields: z.string(),
              stream_friendly: z.string()
            }),
            endpoints: z.object({
              'GET /character/:realm/:name': z.string(),
              'GET /classic-mop/character/:realm/:name': z.string(),
              'GET /character/:realmSlug/:characterName/pvp-bracket/:pvpBracket': z.string(),
              'GET /classic-mop/character/:realmSlug/:characterName/pvp-bracket/:pvpBracket': z.string()
            }),
            field_options: z.object({
              character_endpoints: z.string(),
              bracket_endpoints: z.string()
            })
          })
        }
      },
      description: 'API information and available endpoints'
    }
  }
})

export const rootHandler = (c: any) => {
  return c.json({
    message: 'WoW Classic PvP Rank API',
    query_parameters: {
      'region': 'API region (us, eu, kr, tw) - default: us',
      'locale': 'Locale string (e.g., en_US) - default: en_US',
      'fields': 'Comma-separated list of fields to return',
      'stream_friendly': 'Set to 1 to return plain text format instead of JSON'
    },
    endpoints: {
      'GET /character/:realm/:name': 'Get retail WoW character PvP ratings and ranks',
      'GET /classic-mop/character/:realm/:name': 'Get WoW Classic MoP character PvP ratings and ranks',
      'GET /character/:realmSlug/:characterName/pvp-bracket/:pvpBracket': 'Get specific PvP bracket data for a character',
      'GET /classic-mop/character/:realmSlug/:characterName/pvp-bracket/:pvpBracket': 'Get specific PvP bracket data for a Classic MoP character'
    },
    field_options: {
      'character_endpoints': 'character, honor, ratings, last_updated, class, spec, faction, race, gender, level, average_item_level, equipped_item_level (+ game_version for Classic MoP)',
      'bracket_endpoints': 'character, bracket, rating, season, weekly, last_updated (+ game_version for Classic MoP)'
    }
  })
}
