import { BattleNetTokenResponse, CharacterProfile, PvPBracket } from './types'

let cachedToken: { token: string; expiresAt: number } | null = null

export function formatCharacterAsText(data: any): string {
  const parts: string[] = []
  
  if (data.character) {
    let charInfo = `${data.character.name} - ${data.character.realm}`
    if (data.character.class && data.character.spec) {
      charInfo += ` (${data.character.class} ${data.character.spec})`
    } else if (data.character.class) {
      charInfo += ` (${data.character.class})`
    }
    parts.push(charInfo)
  }
  
  if (data.ratings) {
    const ratings = []
    if (data.ratings['2v2']) ratings.push(`2v2: ${data.ratings['2v2'].rating}`)
    if (data.ratings['3v3']) ratings.push(`3v3: ${data.ratings['3v3'].rating}`)
    if (data.ratings['rbg']) ratings.push(`RBG: ${data.ratings['rbg'].rating}`)
    // Handle other bracket types like shuffle brackets
    Object.keys(data.ratings).forEach(bracket => {
      if (!['2v2', '3v3', 'rbg'].includes(bracket) && data.ratings[bracket]?.rating !== undefined) {
        ratings.push(`${bracket}: ${data.ratings[bracket].rating}`)
      }
    })
    if (ratings.length > 0) parts.push(ratings.join(' | '))
  }
  
  if (data.honor) {
    parts.push(`Honor: ${data.honor.level} | HKs: ${data.honor.honorable_kills}`)
  }
  
  return parts.join(' | ')
}

export function formatBracketAsText(data: any): string {
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

export async function getBattleNetToken(): Promise<string> {
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

export async function getCharacterProfile(
  token: string, 
  region: string, 
  realm: string, 
  name: string, 
  locale: string,
  namespace: string
): Promise<CharacterProfile> {
  const encodedRealm = encodeURIComponent(realm.toLowerCase())
  const encodedName = encodeURIComponent(name.toLowerCase())
  
  const profileUrl = `https://${region}.api.blizzard.com/profile/wow/character/${encodedRealm}/${encodedName}?namespace=${namespace}&locale=${locale}`
  
  const response = await fetch(profileUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch character profile: ${response.status}`)
  }

  return response.json()
}

export async function getPvPBracket(
  token: string, 
  region: string, 
  realm: string, 
  name: string, 
  bracket: string, 
  locale: string,
  namespace: string
): Promise<PvPBracket> {
  const encodedRealm = encodeURIComponent(realm.toLowerCase())
  const encodedName = encodeURIComponent(name.toLowerCase())
  
  const bracketUrl = `https://${region}.api.blizzard.com/profile/wow/character/${encodedRealm}/${encodedName}/pvp-bracket/${bracket}?namespace=${namespace}&locale=${locale}`
  
  const response = await fetch(bracketUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch PvP bracket ${bracket}: ${response.status}`)
  }

  return response.json()
}

export function extractBracketTypeFromHref(href: string): string {
  const match = href.match(/pvp-bracket\/([^?]+)/)
  return match ? match[1] : ''
}