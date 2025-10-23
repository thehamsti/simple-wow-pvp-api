import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { z } from 'zod'
import { cache } from './cache'

interface BattleNetTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface PvPSummary {
  character: {
    name: string
    realm: {
      name: string
      slug: string
    }
  }
  honor_level: number
  pvp_honorable_kills: number
  rated_arena_slots: number
  rated_bg_slots: number
  brackets: {
    '2v2'?: {
      rating: number
      won: number
      lost: number
      played: number
      rank: number
    }
    '3v3'?: {
      rating: number
      won: number
      lost: number
      played: number
      rank: number
    }
    'rbg'?: {
      rating: number
      won: number
      lost: number
      played: number
      rank: number
    }
  }
}

interface PvPBracket {
  character: {
    name: string
    realm: {
      name: string
      slug: string
    }
  }
  bracket: {
    type: string
  }
  rating: number
  season_match_statistics: {
    played: number
    won: number
    lost: number
  }
  weekly_match_statistics: {
    played: number
    won: number
    lost: number
  }
}

const app = new OpenAPIHono()

const CharacterSchema = z.object({
  name: z.string(),
  realm: z.string(),
  realm_slug: z.string()
})

const HonorSchema = z.object({
  level: z.number(),
  honorable_kills: z.number()
})

const RatingSchema = z.object({
  rating: z.number().nullable(),
  won: z.number().nullable(),
  lost: z.number().nullable(),
  played: z.number().nullable(),
  rank: z.number().nullable()
})

const RatingsSchema = z.object({
  '2v2': RatingSchema.nullable(),
  '3v3': RatingSchema.nullable(),
  'rbg': RatingSchema.nullable()
})

const MatchStatisticsSchema = z.object({
  played: z.number(),
  won: z.number(),
  lost: z.number(),
  win_rate: z.number()
})

const CharacterResponseSchema = z.object({
  character: CharacterSchema.optional(),
  honor: HonorSchema.optional(),
  ratings: RatingsSchema.optional(),
  last_updated: z.string().optional(),
  game_version: z.string().optional()
})

const BracketResponseSchema = z.object({
  character: CharacterSchema.optional(),
  bracket: z.string().optional(),
  rating: z.number().optional(),
  season: MatchStatisticsSchema.optional(),
  weekly: MatchStatisticsSchema.optional(),
  last_updated: z.string().optional(),
  game_version: z.string().optional()
})

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional()
})

const QuerySchema = z.object({
  region: z.enum(['us', 'eu', 'kr', 'tw']).optional().default('us'),
  locale: z.string().optional().default('en_US'),
  fields: z.string().optional(),
  stream_friendly: z.enum(['1']).optional()
})

let cachedToken: { token: string; expiresAt: number } | null = null

function formatCharacterAsText(data: any): string {
  const parts: string[] = []
  
  if (data.character) {
    parts.push(`${data.character.name} - ${data.character.realm}`)
  }
  
  if (data.ratings) {
    const ratings = []
    if (data.ratings['2v2']) ratings.push(`2v2: ${data.ratings['2v2'].rating}`)
    if (data.ratings['3v3']) ratings.push(`3v3: ${data.ratings['3v3'].rating}`)
    if (data.ratings['rbg']) ratings.push(`RBG: ${data.ratings['rbg'].rating}`)
    if (ratings.length > 0) parts.push(ratings.join(' | '))
  }
  
  if (data.honor) {
    parts.push(`Honor: ${data.honor.level} | HKs: ${data.honor.honorable_kills}`)
  }
  
  return parts.join(' | ')
}

function formatBracketAsText(data: any): string {
  const parts: string[] = []
  
  if (data.character && data.bracket) {
    parts.push(`${data.character.name} - ${data.character.realm} (${data.bracket})`)
  }
  
  if (data.rating !== undefined) {
    parts.push(`Rating: ${data.rating}`)
  }
  
  if (data.season) {
    parts.push(`Season: ${data.season.won}-${data.season.lost} (${data.season.win_rate}% WR)`)
  }
  
  if (data.weekly) {
    parts.push(`Weekly: ${data.weekly.won}-${data.weekly.lost} (${data.weekly.win_rate}% WR)`)
  }
  
  return parts.join(' | ')
}

async function getBattleNetToken(): Promise<string> {
  const clientId = process.env.BATTLE_NET_CLIENT_ID
  const clientSecret = process.env.BATTLE_NET_CLIENT_SECRET
  const region = process.env.BATTLE_NET_REGION || 'us'

  if (!clientId || !clientSecret) {
    throw new Error('Battle.net API credentials not configured')
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const tokenUrl = `https://${region}.battle.net/oauth/token`
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })

  if (!response.ok) {
    throw new Error('Failed to obtain Battle.net access token')
  }

  const data: BattleNetTokenResponse = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000
  }

  return data.access_token
}

const rootRoute = createRoute({
  method: 'get',
  path: '/',
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

app.openapi(rootRoute, (c) => {
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
      'character_endpoints': 'character, honor, ratings, last_updated (+ game_version for Classic MoP)',
      'bracket_endpoints': 'character, bracket, rating, season, weekly, last_updated (+ game_version for Classic MoP)'
    }
  })
})

const characterRoute = createRoute({
  method: 'get',
  path: '/character/{realm}/{name}',
  tags: ['retail'],
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

app.openapi(characterRoute, async (c) => {
  try {
    const { realm, name } = c.req.valid('param')
    const { region, locale, fields, stream_friendly } = c.req.valid('query')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    console.log(`[GET /character/${realm}/${name}] ip=${ip}, region=${region}, locale=${locale}, fields=${fields || 'none'}, stream_friendly=${stream_friendly || 'false'}`)
    
    const fieldsArray = fields ? fields.split(',') : []
    const streamFriendly = stream_friendly === '1'
    const validFields = ['character', 'honor', 'ratings', 'last_updated']
    
    if (fieldsArray.length > 0 && !fieldsArray.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
     
    if (!realm || !name) {
      return c.json({ error: 'Realm and character name are required' }, 400)
    }

    const cacheKey = `retail:${region}:${realm.toLowerCase()}:${name.toLowerCase()}:${locale}`
    
    const cached = cache.get(cacheKey)
    if (cached) {
      const filteredResult = fieldsArray.length > 0 ? 
        Object.fromEntries(fieldsArray.map(field => [field, cached[field as keyof typeof cached]])) : 
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
    
    const fullResult = {
      character: {
        name: pvpData.character.name,
        realm: pvpData.character.realm.name,
        realm_slug: pvpData.character.realm.slug
      },
      honor: {
        level: pvpData.honor_level,
        honorable_kills: pvpData.pvp_honorable_kills
      },
      ratings: {
        '2v2': pvpData.brackets?.['2v2'] || null,
        '3v3': pvpData.brackets?.['3v3'] || null,
        'rbg': pvpData.brackets?.['rbg'] || null
      },
      last_updated: new Date().toISOString()
    }

    cache.set(cacheKey, fullResult, 300)

    const filteredResult = fieldsArray.length > 0 ? 
      Object.fromEntries(fieldsArray.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
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
})

const classicCharacterRoute = createRoute({
  method: 'get',
  path: '/classic-mop/character/{realm}/{name}',
  tags: ['mop'],
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
      description: 'Classic MoP Character PvP data retrieved successfully'
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
      description: 'Classic MoP character not found'
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

app.openapi(classicCharacterRoute, async (c) => {
  try {
    const { realm, name } = c.req.valid('param')
    const { region, locale, fields, stream_friendly } = c.req.valid('query')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    console.log(`[GET /classic-mop/character/${realm}/${name}] ip=${ip}, region=${region}, locale=${locale}, fields=${fields || 'none'}, stream_friendly=${stream_friendly || 'false'}`)
    
    const fieldsArray = fields ? fields.split(',') : []
    const streamFriendly = stream_friendly === '1'
    const validFields = ['character', 'honor', 'ratings', 'last_updated', 'game_version']
    
    if (fieldsArray.length > 0 && !fieldsArray.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    if (!realm || !name) {
      return c.json({ error: 'Realm and character name are required' }, 400)
    }

    const cacheKey = `classic:${region}:${realm.toLowerCase()}:${name.toLowerCase()}:${locale}`
    
    const cached = cache.get(cacheKey)
    if (cached) {
      const filteredResult = fieldsArray.length > 0 ? 
        Object.fromEntries(fieldsArray.map(field => [field, cached[field as keyof typeof cached]])) : 
        cached

      if (streamFriendly) {
        const text = formatCharacterAsText(filteredResult)
        return c.text(text)
      }

      return c.json(filteredResult)
    }

    const token = await getBattleNetToken()
    const namespace = `profile-classic-${region}`
    
    const encodedRealm = encodeURIComponent(realm.toLowerCase())
    const encodedName = encodeURIComponent(name.toLowerCase())
    
    const pvpUrl = `https://${region}.api.blizzard.com/profile/wow/character/${encodedRealm}/${encodedName}/pvp-summary?namespace=${namespace}&locale=${locale}`
    
    const response = await fetch(pvpUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return c.json({ error: 'Classic MoP character not found' }, 404)
      }
      throw new Error(`Battle.net API error: ${response.status}`)
    }

    const pvpData: PvPSummary = await response.json()
   
    const fullResult = {
      character: {
        name: pvpData.character.name,
        realm: pvpData.character.realm.name,
        realm_slug: pvpData.character.realm.slug
      },
      honor: {
        level: pvpData.honor_level,
        honorable_kills: pvpData.pvp_honorable_kills
      },
      ratings: {
        '2v2': pvpData.brackets?.['2v2'] || null,
        '3v3': pvpData.brackets?.['3v3'] || null,
        'rbg': pvpData.brackets?.['rbg'] || null
      },
      last_updated: new Date().toISOString(),
      game_version: 'classic-mop'
    }

    cache.set(cacheKey, fullResult, 300)

    const filteredResult = fieldsArray.length > 0 ? 
      Object.fromEntries(fieldsArray.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
      fullResult

    if (streamFriendly) {
      const text = formatCharacterAsText(filteredResult)
      return c.text(text)
    }

    return c.json(filteredResult)
  } catch (error) {
    console.error('Error fetching Classic MoP character data:', error)
    return c.json({ 
      error: 'Failed to fetch Classic MoP character data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

const bracketRoute = createRoute({
  method: 'get',
  path: '/character/{realmSlug}/{characterName}/pvp-bracket/{pvpBracket}',
  tags: ['retail'],
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

app.openapi(bracketRoute, async (c) => {
  try {
    const { realmSlug, characterName, pvpBracket } = c.req.valid('param')
    const { region, locale, fields, stream_friendly } = c.req.valid('query')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    console.log(`[GET /character/${realmSlug}/${characterName}/pvp-bracket/${pvpBracket}] ip=${ip}, region=${region}, locale=${locale}, fields=${fields || 'none'}, stream_friendly=${stream_friendly || 'false'}`)
    
    const fieldsArray = fields ? fields.split(',') : []
    const streamFriendly = stream_friendly === '1'
    const validFields = ['character', 'bracket', 'rating', 'season', 'weekly', 'last_updated']
    
    if (fieldsArray.length > 0 && !fieldsArray.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    if (!realmSlug || !characterName) {
      return c.json({ error: 'Realm slug and character name are required' }, 400)
    }

    const cacheKey = `retail:bracket:${region}:${realmSlug.toLowerCase()}:${characterName.toLowerCase()}:${pvpBracket}:${locale}`
    
    const cached = cache.get(cacheKey)
    if (cached) {
      const filteredResult = fieldsArray.length > 0 ? 
        Object.fromEntries(fieldsArray.map(field => [field, cached[field as keyof typeof cached]])) : 
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
      Object.fromEntries(fieldsArray.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
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
})

const classicBracketRoute = createRoute({
  method: 'get',
  path: '/classic-mop/character/{realmSlug}/{characterName}/pvp-bracket/{pvpBracket}',
  tags: ['mop'],
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
      description: 'Classic MoP Character PvP bracket data retrieved successfully'
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
      description: 'Classic MoP character or bracket not found'
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

app.openapi(classicBracketRoute, async (c) => {
  try {
    const { realmSlug, characterName, pvpBracket } = c.req.valid('param')
    const { region, locale, fields, stream_friendly } = c.req.valid('query')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    console.log(`[GET /classic-mop/character/${realmSlug}/${characterName}/pvp-bracket/${pvpBracket}] ip=${ip}, region=${region}, locale=${locale}, fields=${fields || 'none'}, stream_friendly=${stream_friendly || 'false'}`)
    
    const fieldsArray = fields ? fields.split(',') : []
    const streamFriendly = stream_friendly === '1'
    const validFields = ['character', 'bracket', 'rating', 'season', 'weekly', 'last_updated', 'game_version']
    
    if (fieldsArray.length > 0 && !fieldsArray.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    if (!realmSlug || !characterName) {
      return c.json({ error: 'Realm slug and character name are required' }, 400)
    }

    const cacheKey = `classic:bracket:${region}:${realmSlug.toLowerCase()}:${characterName.toLowerCase()}:${pvpBracket}:${locale}`
    
    const cached = cache.get(cacheKey)
    if (cached) {
      const filteredResult = fieldsArray.length > 0 ? 
        Object.fromEntries(fieldsArray.map(field => [field, cached[field as keyof typeof cached]])) : 
        cached

      if (streamFriendly) {
        const text = formatBracketAsText(filteredResult)
        return c.text(text)
      }

      return c.json(filteredResult)
    }

    const token = await getBattleNetToken()
    const namespace = `profile-classic-${region}`
    
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
        return c.json({ error: 'Classic MoP character or bracket not found' }, 404)
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
      last_updated: new Date().toISOString(),
      game_version: 'classic-mop'
    }

    cache.set(cacheKey, fullResult, 300)

    const filteredResult = fieldsArray.length > 0 ? 
      Object.fromEntries(fieldsArray.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
      fullResult

    if (streamFriendly) {
      const text = formatBracketAsText(filteredResult)
      return c.text(text)
    }

    return c.json(filteredResult)
  } catch (error) {
    console.error('Error fetching Classic MoP bracket data:', error)
    return c.json({ 
      error: 'Failed to fetch Classic MoP bracket data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'WoW Classic PvP Rank API',
    description: 'API for fetching WoW character PvP ratings and ranks from Battle.net API'
  },
  tags: [
    {
      name: 'retail',
      description: 'Retail WoW PvP endpoints'
    },
    {
      name: 'mop',
      description: 'WoW Classic MoP PvP endpoints'
    }
  ]
})

app.get('/swagger', swaggerUI({ url: '/doc' }))

export default app
