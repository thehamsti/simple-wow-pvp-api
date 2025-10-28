import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { cache } from '../cache'
import { getBattleNetToken, formatCharacterAsText, getCharacterProfile, getPvPBracket, extractBracketTypeFromHref } from '../utils'
import { 
  PvPSummary, 
  CharacterResponseSchema, 
  ErrorResponseSchema, 
  QuerySchema 
} from '../types'

export const characterRoute = createRoute({
  method: 'get',
  path: '/character/{realm}/{name}',
  tags: ['legacy'],
  request: {
    params: z.object({
      realm: z.string(),
      name: z.string()
    }),
    query: QuerySchema
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CharacterResponseSchema
        }
      },
      description: 'Character PvP data retrieved successfully'
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
      description: 'Character not found'
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

export const characterHandler = async (c: any) => {
  try {
    const { realm, name } = c.req.valid('param')
    const { region, locale, fields, stream_friendly } = c.req.valid('query')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    console.log(`[GET /character/${realm}/${name}] ip=${ip}, region=${region}, locale=${locale}, fields=${fields || 'none'}, stream_friendly=${stream_friendly || 'false'}`)
    
    const fieldsArray = fields ? fields.split(',') : []
    const streamFriendly = stream_friendly === '1'
    const validFields = ['character', 'honor', 'ratings', 'last_updated', 'class', 'spec', 'faction', 'race', 'gender', 'level', 'average_item_level', 'equipped_item_level']
    
    if (fieldsArray.length > 0 && !fieldsArray.every((field: string) => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
     
    if (!realm || !name) {
      return c.json({ error: 'Realm and character name are required' }, 400)
    }

    const cacheKey = `retail:${region}:${realm.toLowerCase()}:${name.toLowerCase()}:${locale}`
    
    const cached = cache.get(cacheKey)
    if (cached) {
      const filteredResult = fieldsArray.length > 0 ? 
        Object.fromEntries(fieldsArray.map((field: string) => [field, cached[field as keyof typeof cached]])) : 
        cached

      if (streamFriendly) {
        const text = formatCharacterAsText(filteredResult)
        return c.text(text)
      }

      return c.json(filteredResult)
    }

    const token = await getBattleNetToken()
    const namespace = `profile-${region}`
    
    const encodedRealm = encodeURIComponent(realm.toLowerCase())
    const encodedName = encodeURIComponent(name.toLowerCase())
    
    // Fetch character profile first
    let characterProfile
    try {
      characterProfile = await getCharacterProfile(token, region, realm, name, locale, namespace)
    } catch (error) {
      console.error('Error fetching character profile:', error)
      // Continue without profile data
    }
    
    // Fetch PvP summary to get bracket hrefs
    const pvpUrl = `https://${region}.api.blizzard.com/profile/wow/character/${encodedRealm}/${encodedName}/pvp-summary?namespace=${namespace}&locale=${locale}`
    
    const response = await fetch(pvpUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return c.json({ error: 'Character not found' }, 404)
      }
      throw new Error(`Battle.net API error: ${response.status}`)
    }

    const pvpData: PvPSummary = await response.json()
   
    console.log('Fetched PvP Data:', pvpData)
    
    // Fetch each bracket independently
    const ratings: any = {}
    
    if (pvpData.brackets && pvpData.brackets.length > 0) {
      const bracketPromises = pvpData.brackets.map(async (bracket) => {
        try {
          const bracketType = extractBracketTypeFromHref(bracket.href)
          const bracketData = await getPvPBracket(token, region, realm, name, bracketType, locale, namespace)
          return { type: bracketType, data: bracketData }
        } catch (error) {
          console.error(`Error fetching bracket ${bracket.href}:`, error)
          return null
        }
      })
      
      const bracketResults = await Promise.allSettled(bracketPromises)
      
      bracketResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { type, data } = result.value
          ratings[type] = {
            rating: data.rating,
            won: data.season_match_statistics.won,
            lost: data.season_match_statistics.lost,
            played: data.season_match_statistics.played,
            rank: null // API doesn't provide rank in bracket endpoint
          }
        }
      })
    }
    
    const fullResult = {
      character: {
        name: pvpData.character.name,
        realm: pvpData.character.realm.name,
        realm_slug: pvpData.character.realm.slug,
        class: characterProfile?.class?.name,
        spec: characterProfile?.active_spec?.name,
        faction: characterProfile?.faction?.name,
        race: characterProfile?.race?.name,
        gender: characterProfile?.gender?.name,
        level: characterProfile?.level,
        average_item_level: characterProfile?.average_item_level,
        equipped_item_level: characterProfile?.equipped_item_level
      },
      honor: {
        level: pvpData.honor_level,
        honorable_kills: pvpData.pvp_honorable_kills
      },
      ratings: ratings,
      last_updated: new Date().toISOString()
    }

    cache.set(cacheKey, fullResult, 300)

    const filteredResult = fieldsArray.length > 0 ? 
      Object.fromEntries(fieldsArray.map((field: string) => [field, fullResult[field as keyof typeof fullResult]])) : 
      fullResult

    if (streamFriendly) {
      const text = formatCharacterAsText(filteredResult)
      return c.text(text)
    }

    return c.json(filteredResult)
  } catch (error) {
    console.error('Error fetching character data:', error)
    return c.json({ 
      error: 'Failed to fetch character data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}
