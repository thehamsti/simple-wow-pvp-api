import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

process.env.BATTLE_NET_CLIENT_ID = 'test-client-id'
process.env.BATTLE_NET_CLIENT_SECRET = 'test-client-secret'
process.env.BATTLE_NET_REGION = 'us'

const characterName = 'Testchar'
const characterSlug = 'testchar'
const realmName = 'Stormrage'
const realmSlug = 'stormrage'

const tokenResponse = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600
}

const retailProfileResponse = {
  name: characterName,
  realm: { name: realmName, slug: realmSlug },
  class: { name: 'Warrior' },
  active_spec: { name: 'Arms' },
  faction: { name: 'Alliance', type: 'ALLIANCE' },
  race: { name: 'Human' },
  gender: { name: 'Male' },
  level: 70,
  average_item_level: 450,
  equipped_item_level: 445,
  last_login_timestamp: 1710000000000
}

function retailSummaryResponse() {
  const base = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterSlug}`
  return {
    character: {
      name: characterName,
      realm: { name: realmName, slug: realmSlug }
    },
    honor_level: 50,
    pvp_honorable_kills: 1234,
    brackets: [
      { href: `${base}/pvp-bracket/2v2` },
      { href: `${base}/pvp-bracket/3v3` },
      { href: `${base}/pvp-bracket/rbg` },
      { href: `${base}/pvp-bracket/shuffle-overall` }
    ]
  }
}

const realmIndexResponse = {
  realms: [
    {
      id: 1,
      name: realmName,
      slug: realmSlug,
      category: 'Normal',
      nameLocalized: 'Stormrage',
      timezone: 'America/Chicago',
      type: { name: 'Normal' },
      population: { name: 'Medium' }
    }
  ]
}

const bracketRatings: Record<string, number> = {
  '2v2': 1825,
  '3v3': 1910,
  rbg: 1750
}

function createBracketResponse(bracket: string) {
  return {
    character: {
      name: characterName,
      realm: {
        name: realmName,
        slug: realmSlug
      }
    },
    rating: bracketRatings[bracket] ?? 0,
    season_match_statistics: {
      played: 20,
      won: 12,
      lost: 8
    },
    weekly_match_statistics: {
      played: 6,
      won: 4,
      lost: 2
    }
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}

const fetchMock = mock(async (input: any, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : String(input)

  if (url.includes('oauth/token')) {
    return jsonResponse(tokenResponse)
  }

  if (url.includes('/data/wow/realm/index')) {
   return jsonResponse(realmIndexResponse)
  }

  if (url.includes('/pvp-summary')) {
    return jsonResponse(retailSummaryResponse())
  }

  if (url.includes('/pvp-bracket/2v2')) {
    return jsonResponse(createBracketResponse('2v2'))
  }

  if (url.includes('/pvp-bracket/3v3')) {
    return jsonResponse(createBracketResponse('3v3'))
  }

  if (url.includes('/pvp-bracket/rbg')) {
    return jsonResponse(createBracketResponse('rbg'))
  }

  if (url.includes('/pvp-bracket/shuffle-overall')) {
    return new Response('Not Found', { status: 404 })
  }

  if (url.includes('/profile/wow/character/') && !url.includes('/pvp-')) {
    return jsonResponse(retailProfileResponse)
  }

  throw new Error(`Unhandled fetch call for ${url}`)
})

globalThis.fetch = fetchMock as any

let app: any
const originalConsoleError = console.error
const consoleErrorMock = mock(() => {})

beforeAll(async () => {
  console.error = consoleErrorMock as any
  const mod = await import('../src/index')
  app = mod.default
})

beforeEach(() => {
  fetchMock.mockClear()
})

afterAll(() => {
  console.error = originalConsoleError
})

describe('v1 endpoints', () => {
  it('reports service status', async () => {
    const res = await app.request('/v1/status')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.status).toBe('ok')
    expect(Array.isArray(body.data.dependencies.battleNet.regions)).toBe(true)
  })

  it('returns supported games metadata', async () => {
    const res = await app.request('/v1/meta/games')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]).toHaveProperty('id')
  })

  it('returns supported regions metadata', async () => {
    const res = await app.request('/v1/meta/regions')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.find((region: any) => region.id === 'us').defaultLocale).toBe('en_US')
  })

  it('lists realms for requested game', async () => {
    const res = await app.request('/v1/meta/retail/realms?region=us&locale=en_US')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data[0].slug).toBe(realmSlug)
    expect(body.meta.region).toBe('us')
  })

  it('returns character summary with field filter', async () => {
    const res = await app.request(
      `/v1/retail/characters/${realmSlug}/${characterSlug}?fields=name,realm`
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.name).toBe(characterName)
    expect(body.meta.requestedFields).toEqual(['name', 'realm'])
  })

  it('rejects unsupported summary fields', async () => {
    const res = await app.request(
      `/v1/retail/characters/${realmSlug}/${characterSlug}?fields=name,unknown`
    )
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('request:invalid_fields')
  })

  it('returns character PvP overview', async () => {
    const res = await app.request(`/v1/retail/characters/${realmSlug}/${characterSlug}/pvp`)
    expect(res.status).toBe(200)

    const body = await res.json()
    const brackets = body.data.season.map((entry: any) => entry.bracket)
    expect(brackets).toContain('2v2')
    expect(brackets).toContain('3v3')
    expect(brackets).toContain('solo_shuffle')
    expect(body.meta.region).toBe('us')
  })

  it('filters PvP brackets on request', async () => {
    const res = await app.request(
      `/v1/retail/characters/${realmSlug}/${characterSlug}/pvp?brackets=3v3`
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.season).toHaveLength(1)
    expect(body.data.season[0].bracket).toBe('3v3')
  })
})
