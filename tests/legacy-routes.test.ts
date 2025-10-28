import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

type HandlerContextOptions = {
  params?: Record<string, any>
  query?: Record<string, any>
  headers?: Record<string, string>
}

type CapturedResponse = {
  body: any
  status: number
  type: 'json' | 'text'
}

function createContext({ params = {}, query = {}, headers = {} }: HandlerContextOptions) {
  const headerMap = new Map<string, string>()
  Object.entries(headers).forEach(([key, value]) => headerMap.set(key.toLowerCase(), value))

  const response: CapturedResponse = {
    body: undefined,
    status: 200,
    type: 'json'
  }

  const ctx = {
    req: {
      valid: (segment: string) => (segment === 'param' ? params : query),
      header: (name: string) => headerMap.get(name.toLowerCase())
    },
    json: (body: any, status = 200) => {
      response.body = body
      response.status = status
      response.type = 'json'
      return response
    },
    text: (body: string, status = 200) => {
      response.body = body
      response.status = status
      response.type = 'text'
      return response
    }
  }

  return { ctx, response }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}

const tokenResponse = {
  access_token: 'legacy-token',
  expires_in: 3600,
  token_type: 'bearer'
}

const baseCharacter = {
  character: {
    name: 'Testchar',
    realm: { name: 'Stormrage', slug: 'stormrage' }
  },
  honor_level: 50,
  pvp_honorable_kills: 1200,
  brackets: [
    { href: 'https://us.api.blizzard.com/profile/wow/character/stormrage/testchar/pvp-bracket/2v2' },
    { href: 'https://us.api.blizzard.com/profile/wow/character/stormrage/testchar/pvp-bracket/3v3' },
    { href: 'https://us.api.blizzard.com/profile/wow/character/stormrage/testchar/pvp-bracket/rbg' }
  ]
}

function createBracketResponse(rating: number) {
  return {
    character: {
      name: 'Testchar',
      realm: {
        name: 'Stormrage',
        slug: 'stormrage'
      }
    },
    rating,
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

function createProfileResponse(gameVersion: 'retail' | 'classic') {
  const base = {
    name: 'Testchar',
    realm: { name: 'Stormrage', slug: 'stormrage' },
    class: { name: 'Warrior' },
    active_spec: { name: 'Arms' },
    faction: { name: 'Alliance' },
    race: { name: 'Human' },
    gender: { name: 'Male' },
    level: gameVersion === 'retail' ? 70 : 80,
    average_item_level: 400,
    equipped_item_level: 395
  }

  return base
}

let fetchMock: ReturnType<typeof mock>
let consoleLogMock: ReturnType<typeof mock>
let consoleErrorMock: ReturnType<typeof mock>

let cacheInstance: any
let cacheStore: Map<string, any>
let originalCacheMethods: {
  get: any
  set: any
  delete: any
  cleanup: any
}

let retailCharacterHandler: typeof import('../src/routes/retail-character').characterHandler
let classicCharacterHandler: typeof import('../src/routes/classic-character').classicCharacterHandler
let retailBracketHandler: typeof import('../src/routes/retail-bracket').bracketHandler
let classicBracketHandler: typeof import('../src/routes/classic-bracket').classicBracketHandler
let rootHandler: typeof import('../src/routes/root').rootHandler

const originalFetch = globalThis.fetch
const originalConsoleLog = console.log
const originalConsoleError = console.error

beforeAll(async () => {
  ;({ cache: cacheInstance } = await import('../src/cache'))
  ;({ characterHandler: retailCharacterHandler } = await import('../src/routes/retail-character'))
  ;({ classicCharacterHandler } = await import('../src/routes/classic-character'))
  ;({ bracketHandler: retailBracketHandler } = await import('../src/routes/retail-bracket'))
  ;({ classicBracketHandler } = await import('../src/routes/classic-bracket'))
  ;({ rootHandler } = await import('../src/routes/root'))

  originalCacheMethods = {
    get: cacheInstance.get.bind(cacheInstance),
    set: cacheInstance.set.bind(cacheInstance),
    delete: cacheInstance.delete.bind(cacheInstance),
    cleanup: cacheInstance.cleanup.bind(cacheInstance)
  }
})

beforeEach(() => {
  process.env.BATTLE_NET_CLIENT_ID = 'test-client-id'
  process.env.BATTLE_NET_CLIENT_SECRET = 'test-client-secret'
  process.env.BATTLE_NET_REGION = 'us'

  cacheStore = new Map()

  cacheInstance.get = mock((key: string) => cacheStore.get(key) ?? null)
  cacheInstance.set = mock((key: string, value: any) => cacheStore.set(key, value))
  cacheInstance.delete = mock((key: string) => {
    cacheStore.delete(key)
  })
  cacheInstance.cleanup = mock(() => {})

  fetchMock = mock(async () => {
    throw new Error('Unhandled fetch call')
  })

  consoleLogMock = mock(() => {})
  consoleErrorMock = mock(() => {})

  globalThis.fetch = fetchMock as any
  console.log = consoleLogMock as any
  console.error = consoleErrorMock as any
})

afterEach(() => {
  cacheInstance.get = originalCacheMethods.get
  cacheInstance.set = originalCacheMethods.set
  cacheInstance.delete = originalCacheMethods.delete
  cacheInstance.cleanup = originalCacheMethods.cleanup

  cacheStore.clear()

  globalThis.fetch = originalFetch
  console.log = originalConsoleLog
  console.error = originalConsoleError
})

afterAll(() => {
  delete process.env.BATTLE_NET_CLIENT_ID
  delete process.env.BATTLE_NET_CLIENT_SECRET
  delete process.env.BATTLE_NET_REGION
})

describe('root handler', () => {
  it('returns legacy API metadata', () => {
    const { ctx, response } = createContext({ params: {}, query: {} })
    const result = rootHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('WoW Classic PvP Rank API')
    expect(response.body.field_options.character_endpoints).toContain('character')
  })
})

describe('retail bracket handler', () => {
  const params = {
    realmSlug: 'stormrage',
    characterName: 'testchar',
    pvpBracket: '2v2'
  }

  const queryBase = {
    region: 'us',
    locale: 'en_US',
    fields: '',
    stream_friendly: '0'
  }

  it('returns cached bracket data with field selection', async () => {
    const cachedPayload = {
      character: { name: 'Testchar' },
      bracket: '2v2',
      rating: 1850,
      season: { played: 20, won: 12, lost: 8, win_rate: 60 },
      weekly: { played: 6, won: 4, lost: 2, win_rate: 67 },
      last_updated: 'now'
    }

    cacheStore.set(
      'retail:bracket:us:stormrage:testchar:2v2:en_US',
      cachedPayload
    )

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'character,rating' }
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      character: cachedPayload.character,
      rating: cachedPayload.rating
    })
    expect(cacheInstance.set.mock.calls.length).toBe(0)
  })

  it('supports stream-friendly cached responses', async () => {
    cacheStore.set('retail:bracket:us:stormrage:testchar:2v2:en_US', {
      character: { name: 'Testchar', realm: 'Stormrage' },
      bracket: '2v2',
      rating: 1800
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1' }
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.type).toBe('text')
    expect(response.body).toContain('Testchar')
  })

  it('fetches bracket data when cache is cold', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-bracket/2v2')) {
        return jsonResponse(createBracketResponse(1860))
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(200)
    expect(response.body.rating).toBe(1860)
    expect(cacheInstance.set.mock.calls[0][0]).toBe(
      'retail:bracket:us:stormrage:testchar:2v2:en_US'
    )
  })

  it('produces stream output after fetching fresh data when requested', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-bracket/2v2')) {
        return jsonResponse(createBracketResponse(1905))
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1' }
    })

    await retailBracketHandler(ctx as any)

    expect(response.type).toBe('text')
    expect(response.body).toContain('Rating: 1905')
  })

  it('validates requested fields', async () => {
    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'invalid' }
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Invalid fields.')
  })

  it('requires realm and character name', async () => {
    const { ctx, response } = createContext({
      params: { ...params, realmSlug: '' },
      query: queryBase
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(400)
  })

  it('returns 404 for missing bracket', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }
      return new Response('missing', { status: 404 })
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(404)
    expect(response.body.error).toContain('Character or bracket not found')
  })

  it('handles upstream errors', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }
      return new Response('boom', { status: 500 })
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    const result = await retailBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Failed to fetch bracket data')
    expect(response.body.message).toContain('Battle.net API error: 500')
  })
})

describe('classic bracket handler', () => {
  const params = {
    realmSlug: 'stormrage',
    characterName: 'testchar',
    pvpBracket: '3v3'
  }

  const queryBase = {
    region: 'us',
    locale: 'en_US',
    fields: '',
    stream_friendly: '0'
  }

  it('serves cached data in stream-friendly mode', async () => {
    cacheStore.set('classic:bracket:us:stormrage:testchar:3v3:en_US', {
      character: { name: 'Testchar', realm: 'Stormrage' },
      bracket: '3v3',
      rating: 1950,
      game_version: 'classic-mop'
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1', fields: 'character,bracket,rating' }
    })

    const result = await classicBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.type).toBe('text')
    expect(response.body).toContain('Testchar')
  })

  it('returns cached JSON when streaming is disabled', async () => {
    const payload = {
      character: { name: 'Testchar', realm: 'Stormrage' },
      bracket: '3v3',
      rating: 1800,
      game_version: 'classic-mop'
    }

    cacheStore.set('classic:bracket:us:stormrage:testchar:3v3:en_US', payload)

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicBracketHandler(ctx as any)

    expect(response.type).toBe('json')
    expect(response.body).toEqual(payload)
  })

  it('fetches bracket data when cache misses', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-bracket/3v3')) {
        return jsonResponse(createBracketResponse(2000))
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    const result = await classicBracketHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(200)
    expect(response.body.game_version).toBe('classic-mop')
    expect(cacheInstance.set.mock.calls[0][0]).toBe(
      'classic:bracket:us:stormrage:testchar:3v3:en_US'
    )
  })

  it('produces stream output after fetching new data when requested', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-bracket/3v3')) {
        return jsonResponse(createBracketResponse(2100))
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1' }
    })

    await classicBracketHandler(ctx as any)

    expect(response.type).toBe('text')
    expect(response.body).toContain('Rating: 2100')
  })

  it('validates field selections', async () => {
    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'invalid' }
    })

    await classicBracketHandler(ctx as any)

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Invalid fields.')
  })

  it('returns 404 for missing Classic bracket', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }
      return new Response('missing', { status: 404 })
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicBracketHandler(ctx as any)

    expect(response.status).toBe(404)
    expect(response.body.error).toContain('Classic MoP character or bracket not found')
  })

  it('handles unexpected Battle.net errors', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }
      return new Response('error', { status: 500 })
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicBracketHandler(ctx as any)

    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Failed to fetch Classic MoP bracket data')
  })

  it('requires realm and character name parameters', async () => {
    const { ctx, response } = createContext({
      params: { ...params, realmSlug: '' },
      query: queryBase
    })

    await classicBracketHandler(ctx as any)

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Realm slug and character name are required')
  })
})

function configureSuccessfulCharacterFetch(
  gameVersion: 'retail' | 'classic',
  options: { failBracket?: boolean; profileFailure?: boolean } = {}
) {
  const { failBracket = false, profileFailure = false } = options

  fetchMock.mockImplementation(async (input) => {
    const url = String(input)

    if (url.includes('oauth/token')) {
      return jsonResponse(tokenResponse)
    }

    if (url.includes('/pvp-summary')) {
      return jsonResponse(baseCharacter)
    }

    if (url.includes('/pvp-bracket/2v2')) {
      if (failBracket) {
        return new Response('not found', { status: 500 })
      }
      return jsonResponse(createBracketResponse(1825))
    }

    if (url.includes('/pvp-bracket/3v3')) {
      return jsonResponse(createBracketResponse(1900))
    }

    if (url.includes('/pvp-bracket/rbg')) {
      return jsonResponse(createBracketResponse(1750))
    }

    if (url.includes('/profile/wow/character/')) {
      if (profileFailure) {
        return new Response('boom', { status: 500 })
      }
      return jsonResponse(createProfileResponse(gameVersion))
    }

    throw new Error(`Unexpected fetch call: ${url}`)
  })
}

describe('retail character handler', () => {
  const params = { realm: 'Stormrage', name: 'Testchar' }
  const queryBase = {
    region: 'us',
    locale: 'en_US',
    fields: '',
    stream_friendly: '0'
  }

  it('serves cached data with filtering and stream response', async () => {
    cacheStore.set('retail:us:stormrage:testchar:en_US', {
      character: { name: 'Testchar', realm: 'Stormrage' },
      ratings: { '2v2': { rating: 1800 } },
      game_version: 'retail'
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'character,ratings', stream_friendly: '1' }
    })

    const result = await retailCharacterHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.type).toBe('text')
    expect(response.body).toContain('Testchar')
    expect(cacheInstance.set.mock.calls.length).toBe(0)
  })

  it('serves cached JSON data when stream-friendly is not requested', async () => {
    const payload = {
      character: { name: 'Testchar', realm: 'Stormrage' },
      ratings: { '2v2': { rating: 1900 } },
      honor: { level: 52, honorable_kills: 1300 }
    }

    cacheStore.set('retail:us:stormrage:testchar:en_US', payload)

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await retailCharacterHandler(ctx as any)

    expect(response.type).toBe('json')
    expect(response.body).toEqual(payload)
  })

  it('fetches character data when cache is empty', async () => {
    configureSuccessfulCharacterFetch('retail')

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    const result = await retailCharacterHandler(ctx as any)

    expect(result).toBe(response)
    expect(response.status).toBe(200)
    expect(response.body.character.name).toBe('Testchar')
    expect(response.body.ratings['2v2'].rating).toBe(1825)
    expect(cacheInstance.set.mock.calls[0][0]).toBe('retail:us:stormrage:testchar:en_US')
  })

  it('continues when profile fetch fails', async () => {
    configureSuccessfulCharacterFetch('retail', { profileFailure: true })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await retailCharacterHandler(ctx as any)

    expect(response.status).toBe(200)
    expect(response.body.character.class).toBeUndefined()
    expect(consoleErrorMock.mock.calls.length).toBeGreaterThan(0)
  })

  it('handles bracket fetch errors gracefully', async () => {
    configureSuccessfulCharacterFetch('retail', { failBracket: true })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await retailCharacterHandler(ctx as any)

    expect(response.status).toBe(200)
    expect(response.body.ratings['2v2']).toBeUndefined()
    expect(consoleErrorMock.mock.calls.length).toBeGreaterThan(0)
  })

  it('validates requested fields', async () => {
    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'invalid' }
    })

    await retailCharacterHandler(ctx as any)

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Invalid fields')
  })

  it('requires realm and character name', async () => {
    const { ctx, response } = createContext({
      params: { ...params, realm: '' },
      query: queryBase
    })

    await retailCharacterHandler(ctx as any)

    expect(response.status).toBe(400)
  })

  it('returns 404 when Battle.net reports missing character', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-summary')) {
        return new Response('missing', { status: 404 })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await retailCharacterHandler(ctx as any)

    expect(response.status).toBe(404)
    expect(response.body.error).toBe('Character not found')
  })

  it('returns 500 on unexpected Battle.net errors', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-summary')) {
        return new Response('boom', { status: 500 })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await retailCharacterHandler(ctx as any)

    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Failed to fetch character data')
    expect(response.body.message).toContain('Battle.net API error: 500')
  })

  it('produces stream output after fetching fresh data when requested', async () => {
    configureSuccessfulCharacterFetch('retail')

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1' }
    })

    await retailCharacterHandler(ctx as any)

    expect(response.type).toBe('text')
    expect(response.body).toContain('Testchar')
  })
})

describe('classic character handler', () => {
  const params = { realm: 'Stormrage', name: 'Testchar' }
  const queryBase = {
    region: 'us',
    locale: 'en_US',
    fields: '',
    stream_friendly: '0'
  }

  it('serves cached data with game version metadata', async () => {
    cacheStore.set('classic:us:stormrage:testchar:en_US', {
      character: { name: 'Testchar', realm: 'Stormrage' },
      game_version: 'classic-mop'
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'character,game_version' }
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      character: { name: 'Testchar', realm: 'Stormrage' },
      game_version: 'classic-mop'
    })
  })

  it('serves cached data as text when stream friendly is enabled', async () => {
    cacheStore.set('classic:us:stormrage:testchar:en_US', {
      character: { name: 'Testchar', realm: 'Stormrage' },
      ratings: { '2v2': { rating: 1500 } },
      honor: { level: 40, honorable_kills: 900 }
    })

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1' }
    })

    await classicCharacterHandler(ctx as any)

    expect(response.type).toBe('text')
    expect(response.body).toContain('Testchar')
  })

  it('fetches Classic character data when cache misses', async () => {
    configureSuccessfulCharacterFetch('classic')

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(200)
    expect(response.body.game_version).toBe('classic-mop')
    expect(response.body.character.level).toBe(80)
    expect(cacheInstance.set.mock.calls[0][0]).toBe('classic:us:stormrage:testchar:en_US')
  })

  it('produces stream output after fetching fresh Classic data when requested', async () => {
    configureSuccessfulCharacterFetch('classic')

    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, stream_friendly: '1' }
    })

    await classicCharacterHandler(ctx as any)

    expect(response.type).toBe('text')
    expect(response.body).toContain('Testchar')
  })

  it('handles bracket fetch errors without failing request', async () => {
    configureSuccessfulCharacterFetch('classic', { failBracket: true })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(200)
    expect(response.body.ratings['2v2']).toBeUndefined()
    expect(consoleErrorMock.mock.calls.length).toBeGreaterThan(0)
  })

  it('validates requested fields for Classic', async () => {
    const { ctx, response } = createContext({
      params,
      query: { ...queryBase, fields: 'invalid' }
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(400)
  })

  it('returns 404 when Classic Battle.net reports missing character', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-summary')) {
        return new Response('missing', { status: 404 })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(404)
    expect(response.body.error).toBe('Classic MoP character not found')
  })

  it('returns 500 when Classic Battle.net errors', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)

      if (url.includes('oauth/token')) {
        return jsonResponse(tokenResponse)
      }

      if (url.includes('/pvp-summary')) {
        return new Response('boom', { status: 500 })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const { ctx, response } = createContext({
      params,
      query: queryBase
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Failed to fetch Classic MoP character data')
  })

  it('requires realm and character name parameters', async () => {
    const { ctx, response } = createContext({
      params: { ...params, realm: '' },
      query: queryBase
    })

    await classicCharacterHandler(ctx as any)

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Realm and character name are required')
  })
})
