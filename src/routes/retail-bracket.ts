import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { cache } from '../cache'
import { getBattleNetToken, formatBracketAsText } from '../utils'
import { 
  PvPBracket, 
  BracketResponseSchema, 
  ErrorResponseSchema, 
  QuerySchema 
} from '../types'

export const bracketRoute = createRoute({
  method: 'get',
  path: '/character/{realmSlug}/{characterName}/pvp-bracket/{pvpBracket}',
  tags: ['legacy'],
  request: {
    params: z.object({
      realmSlug: z.string(),
      characterName: z.string(),
      pvpBracket: z.enum(['2v2', '3v3', 'rbg'])
    }),
    query: QuerySchema
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: BracketResponseSchema
        }
      },
      description: 'Character PvP bracket data retrieved successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Bad request - invalid parameters'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Character or bracket not found'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

export const bracketHandler = async (c: any) => {
  try {
    const { realmSlug, characterName, pvpBracket } = c.req.valid('param')
    const { region, locale, fields, stream_friendly } = c.req.valid('query')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    console.log(`[GET /character/${realmSlug}/${characterName}/pvp-bracket/${pvpBracket}] ip=${ip}, region=${region}, locale=${locale}, fields=${fields || 'none'}, stream_friendly=${stream_friendly || 'false'}`)
    
    const fieldsArray = fields ? fields.split(',') : []
    const streamFriendly = stream_friendly === '1'
    const validFields = ['character', 'bracket', 'rating', 'season', 'weekly', 'last_updated']
    
    if (fieldsArray.length > 0 && !fieldsArray.every((field: string) => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    if (!realmSlug || !characterName) {
      return c.json({ error: 'Realm slug and character name are required' }, 400)
    }

    const cacheKey = `retail:bracket:${region}:${realmSlug.toLowerCase()}:${characterName.toLowerCase()}:${pvpBracket}:${locale}`
    
    const cached = cache.get(cacheKey)
    if (cached) {
      const filteredResult = fieldsArray.length > 0 ? 
        Object.fromEntries(fieldsArray.map((field: string) => [field, cached[field as keyof typeof cached]])) : 
        cached

      if (streamFriendly) {
        const text = formatBracketAsText(filteredResult)
        return c.text(text)
      }

      return c.json(filteredResult)
    }

    const token = await getBattleNetToken()
    const namespace = `profile-${region}`
    
    const encodedRealm = encodeURIComponent(realmSlug.toLowerCase())
    const encodedName = encodeURIComponent(characterName.toLowerCase())
    
    const pvpUrl = `https://${region}.api.blizzard.com/profile/wow/character/${encodedRealm}/${encodedName}/pvp-bracket/${pvpBracket}?namespace=${namespace}&locale=${locale}`
    
    const response = await fetch(pvpUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return c.json({ error: 'Character or bracket not found' }, 404)
      }
      throw new Error(`Battle.net API error: ${response.status}`)
    }

    const bracketData: PvPBracket = await response.json()
    
    const fullResult = {
      character: {
        name: bracketData.character.name,
        realm: bracketData.character.realm.name,
        realm_slug: bracketData.character.realm.slug
      },
      bracket: pvpBracket,
      rating: bracketData.rating,
      season: {
        played: bracketData.season_match_statistics.played,
        won: bracketData.season_match_statistics.won,
        lost: bracketData.season_match_statistics.lost,
        win_rate: bracketData.season_match_statistics.played > 0 ? Math.round((bracketData.season_match_statistics.won / bracketData.season_match_statistics.played) * 100) : 0
      },
      weekly: {
        played: bracketData.weekly_match_statistics.played,
        won: bracketData.weekly_match_statistics.won,
        lost: bracketData.weekly_match_statistics.lost,
        win_rate: bracketData.weekly_match_statistics.played > 0 ? Math.round((bracketData.weekly_match_statistics.won / bracketData.weekly_match_statistics.played) * 100) : 0
      },
      last_updated: new Date().toISOString()
    }

    cache.set(cacheKey, fullResult, 300)

    const filteredResult = fieldsArray.length > 0 ? 
      Object.fromEntries(fieldsArray.map((field: string) => [field, fullResult[field as keyof typeof fullResult]])) : 
      fullResult

    if (streamFriendly) {
      const text = formatBracketAsText(filteredResult)
      return c.text(text)
    }

    return c.json(filteredResult)
  } catch (error) {
    console.error('Error fetching bracket data:', error)
    return c.json({ 
      error: 'Failed to fetch bracket data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}
