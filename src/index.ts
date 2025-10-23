import { Hono } from 'hono'
import { validator } from 'hono/validator'

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

const app = new Hono()

let cachedToken: { token: string; expiresAt: number } | null = null

function formatCharacterAsText(data: any): string {
  const lines: string[] = []
  
  if (data.character) {
    lines.push(`${data.character.name} - ${data.character.realm}`)
  }
  
  if (data.honor) {
    lines.push(`Honor Level: ${data.honor.level} | HKs: ${data.honor.honorable_kills}`)
  }
  
  if (data.ratings) {
    const ratings = []
    if (data.ratings['2v2']) ratings.push(`2v2: ${data.ratings['2v2'].rating}`)
    if (data.ratings['3v3']) ratings.push(`3v3: ${data.ratings['3v3'].rating}`)
    if (data.ratings['rbg']) ratings.push(`RBG: ${data.ratings['rbg'].rating}`)
    if (ratings.length > 0) lines.push(`Ratings: ${ratings.join(' | ')}`)
  }
  
  if (data.last_updated) {
    lines.push(`Updated: ${new Date(data.last_updated).toLocaleString()}`)
  }
  
  return lines.join('\n')
}

function formatBracketAsText(data: any): string {
  const lines: string[] = []
  
  if (data.character) {
    lines.push(`${data.character.name} - ${data.character.realm} (${data.bracket})`)
  }
  
  if (data.rating !== undefined) {
    lines.push(`Rating: ${data.rating}`)
  }
  
  if (data.season) {
    lines.push(`Season: ${data.season.won}-${data.season.lost} (${data.season.played} games, ${data.season.win_rate}% WR)`)
  }
  
  if (data.weekly) {
    lines.push(`Weekly: ${data.weekly.won}-${data.weekly.lost} (${data.weekly.played} games, ${data.weekly.win_rate}% WR)`)
  }
  
  if (data.last_updated) {
    lines.push(`Updated: ${new Date(data.last_updated).toLocaleString()}`)
  }
  
  return lines.join('\n')
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

app.get('/', (c) => {
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

app.get(
  '/character/:realm/:name',
  validator('query', (value, c) => {
    const region = value.region || 'us'
    const locale = value.locale || 'en_US'
    const fields = value.fields ? value.fields.split(',') : []
    const streamFriendly = value.stream_friendly === '1'
    const validRegions = ['us', 'eu', 'kr', 'tw']
    const validFields = ['character', 'honor', 'ratings', 'last_updated']
    
    if (!validRegions.includes(region)) {
      return c.json({ error: 'Invalid region. Must be one of: us, eu, kr, tw' }, 400)
    }
    
    if (fields.length > 0 && !fields.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    return { region, locale, fields, streamFriendly }
}),
  async (c) => {
    try {
      const { realm, name } = c.req.param()
      const { region, locale, fields, streamFriendly } = c.req.valid('query')
       
      if (!realm || !name) {
        return c.json({ error: 'Realm and character name are required' }, 400)
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

      const filteredResult = fields.length > 0 ? 
        Object.fromEntries(fields.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
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
)

app.get(
  '/classic-mop/character/:realm/:name',
  validator('query', (value, c) => {
    const region = value.region || 'us'
    const locale = value.locale || 'en_US'
    const fields = value.fields ? value.fields.split(',') : []
    const streamFriendly = value.stream_friendly === '1'
    const validRegions = ['us', 'eu', 'kr', 'tw']
    const validFields = ['character', 'honor', 'ratings', 'last_updated', 'game_version']
    
    if (!validRegions.includes(region)) {
      return c.json({ error: 'Invalid region. Must be one of: us, eu, kr, tw' }, 400)
    }
    
    if (fields.length > 0 && !fields.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    return { region, locale, fields, streamFriendly }
  }),
  async (c) => {
    try {
      const { realm, name } = c.req.param()
      const { region, locale, fields, streamFriendly } = c.req.valid('query')
      
      if (!realm || !name) {
        return c.json({ error: 'Realm and character name are required' }, 400)
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
     
      console.log(pvpData)
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

      const filteredResult = fields.length > 0 ? 
        Object.fromEntries(fields.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
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
  }
)

app.get(
  '/character/:realmSlug/:characterName/pvp-bracket/:pvpBracket',
  validator('query', (value, c) => {
    const region = value.region || 'us'
    const locale = value.locale || 'en_US'
    const fields = value.fields ? value.fields.split(',') : []
    const streamFriendly = value.stream_friendly === '1'
    const validRegions = ['us', 'eu', 'kr', 'tw']
    const validFields = ['character', 'bracket', 'rating', 'season', 'weekly', 'last_updated']
    
    if (!validRegions.includes(region)) {
      return c.json({ error: 'Invalid region. Must be one of: us, eu, kr, tw' }, 400)
    }
    
    if (fields.length > 0 && !fields.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    return { region, locale, fields, streamFriendly }
  }),
  async (c) => {
    try {
      const { realmSlug, characterName, pvpBracket } = c.req.param()
      const { region, locale } = c.req.valid('query')
      
      const validBrackets = ['2v2', '3v3', 'rbg']
      if (!validBrackets.includes(pvpBracket)) {
        return c.json({ error: 'Invalid PvP bracket. Must be one of: 2v2, 3v3, rbg' }, 400)
      }
      
      if (!realmSlug || !characterName) {
        return c.json({ error: 'Realm slug and character name are required' }, 400)
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

      const filteredResult = fields.length > 0 ? 
        Object.fromEntries(fields.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
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
)

app.get(
  '/classic-mop/character/:realmSlug/:characterName/pvp-bracket/:pvpBracket',
  validator('query', (value, c) => {
    const region = value.region || 'us'
    const locale = value.locale || 'en_US'
    const fields = value.fields ? value.fields.split(',') : []
    const streamFriendly = value.stream_friendly === '1'
    const validRegions = ['us', 'eu', 'kr', 'tw']
    const validFields = ['character', 'bracket', 'rating', 'season', 'weekly', 'last_updated', 'game_version']
    
    if (!validRegions.includes(region)) {
      return c.json({ error: 'Invalid region. Must be one of: us, eu, kr, tw' }, 400)
    }
    
    if (fields.length > 0 && !fields.every(field => validFields.includes(field))) {
      return c.json({ error: `Invalid fields. Valid fields are: ${validFields.join(', ')}` }, 400)
    }
    
    return { region, locale, fields, streamFriendly }
  }),
  async (c) => {
    try {
const { realmSlug, characterName, pvpBracket } = c.req.param()
      const { region, locale, fields, streamFriendly } = c.req.valid('query')
       
      const validBrackets = ['2v2', '3v3', 'rbg']
      if (!validBrackets.includes(pvpBracket)) {
        return c.json({ error: 'Invalid PvP bracket. Must be one of: 2v2, 3v3, rbg' }, 400)
      }
       
      if (!realmSlug || !characterName) {
        return c.json({ error: 'Realm slug and character name are required' }, 400)
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

      const filteredResult = fields.length > 0 ? 
        Object.fromEntries(fields.map(field => [field, fullResult[field as keyof typeof fullResult]])) : 
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
  }
)

export default app
