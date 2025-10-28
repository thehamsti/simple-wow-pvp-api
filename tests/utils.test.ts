import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const originalFetch = globalThis.fetch
const originalDateNow = Date.now

const originalEnv = {
  id: process.env.BATTLE_NET_CLIENT_ID,
  secret: process.env.BATTLE_NET_CLIENT_SECRET,
  region: process.env.BATTLE_NET_REGION
}

let fetchMock: ReturnType<typeof mock>
let utils: typeof import('../src/utils')

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}

beforeAll(async () => {
  utils = await import('../src/utils')
})

beforeEach(() => {
  fetchMock = mock(async () => jsonResponse({}))
  globalThis.fetch = fetchMock as any
  Date.now = originalDateNow
  process.env.BATTLE_NET_CLIENT_ID = 'test-client-id'
  process.env.BATTLE_NET_CLIENT_SECRET = 'test-client-secret'
  process.env.BATTLE_NET_REGION = 'us'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  Date.now = originalDateNow
  fetchMock.mockReset()

  if (originalEnv.id === undefined) {
    delete process.env.BATTLE_NET_CLIENT_ID
  } else {
    process.env.BATTLE_NET_CLIENT_ID = originalEnv.id
  }

  if (originalEnv.secret === undefined) {
    delete process.env.BATTLE_NET_CLIENT_SECRET
  } else {
    process.env.BATTLE_NET_CLIENT_SECRET = originalEnv.secret
  }

  if (originalEnv.region === undefined) {
    delete process.env.BATTLE_NET_REGION
  } else {
    process.env.BATTLE_NET_REGION = originalEnv.region
  }
})

describe('formatCharacterAsText', () => {
  it('formats character data with ratings and honor details', async () => {
    const text = utils.formatCharacterAsText({
      character: {
        name: 'Testchar',
        realm: 'Stormrage',
        class: 'Mage',
        spec: 'Frost'
      },
      ratings: {
        '2v2': { rating: 1600 },
        rbg: { rating: 1700 },
        'shuffle-overall': { rating: 1800 }
      },
      honor: {
        level: 50,
        honorable_kills: 1234
      }
    })

    expect(text).toContain('Testchar - Stormrage (Mage Frost)')
    expect(text).toContain('2v2: 1600')
    expect(text).toContain('shuffle-overall: 1800')
    expect(text).toContain('Honor: 50 | HKs: 1234')
  })

  it('includes class name when no specialization is available', () => {
    const text = utils.formatCharacterAsText({
      character: {
        name: 'Solo',
        realm: 'Stormrage',
        class: 'Priest'
      }
    })

    expect(text).toContain('(Priest)')
  })

  it('omits optional sections when data is missing', async () => {
    const text = utils.formatCharacterAsText({
      character: {
        name: 'Solo',
        realm: 'Area 52'
      }
    })

    expect(text).toBe('Solo - Area 52')
  })
})

describe('formatBracketAsText', () => {
  it('formats bracket data with rating and win rates', async () => {
    const text = utils.formatBracketAsText({
      character: { name: 'Testchar', realm: 'Stormrage' },
      bracket: '2v2',
      rating: 1850,
      season: { won: 20, lost: 10, win_rate: 67 },
      weekly: { won: 6, lost: 3, win_rate: 67 }
    })

    expect(text).toContain('Testchar - Stormrage (2v2)')
    expect(text).toContain('Rating: 1850')
    expect(text).toContain('Season: 20-10 (67% WR)')
    expect(text).toContain('Weekly: 6-3 (67% WR)')
  })
})

describe('getBattleNetToken', () => {
  it('throws when credentials are missing', async () => {
    delete process.env.BATTLE_NET_CLIENT_ID
    delete process.env.BATTLE_NET_CLIENT_SECRET

    await expect(utils.getBattleNetToken()).rejects.toThrow('Battle.net API credentials not configured')
    expect(fetchMock.mock.calls.length).toBe(0)
  })

  it('fetches and caches the access token until expiry', async () => {
    let currentTime = 1_000_000
    Date.now = () => currentTime

    fetchMock.mockImplementation(async () =>
      jsonResponse({
        access_token: 'token-1',
        expires_in: 120
      })
    )

    const tokenA = await utils.getBattleNetToken()

    expect(tokenA).toBe('token-1')
    expect(fetchMock.mock.calls.length).toBe(1)

    fetchMock.mockClear()

    const tokenB = await utils.getBattleNetToken()
    expect(tokenB).toBe('token-1')
    expect(fetchMock.mock.calls.length).toBe(0)

    fetchMock.mockImplementation(async () =>
      jsonResponse({
        access_token: 'token-2',
        expires_in: 120
      })
    )

    currentTime += 121_000 // past cached expiry (120s - 60s buffer)

    const tokenC = await utils.getBattleNetToken()
    expect(tokenC).toBe('token-2')
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  it('throws when the token request fails', async () => {
    fetchMock.mockImplementation(async () => new Response('error', { status: 500 }))

    await expect(utils.getBattleNetToken()).rejects.toThrow('Failed to obtain Battle.net access token')
  })
})

describe('profile and bracket fetch helpers', () => {
  it('retrieves a character profile', async () => {
    const body = { name: 'Testchar' }

    fetchMock.mockImplementation(async (input, init) => {
      expect(init?.headers?.Authorization).toBe('Bearer abc')
      expect(String(input)).toContain('/profile/wow/character/stormrage/testchar')
      return jsonResponse(body)
    })

    const result = await utils.getCharacterProfile(
      'abc',
      'us',
      'Stormrage',
      'TestChar',
      'en_US',
      'profile-us'
    )
    expect(result).toEqual(body)
  })

  it('throws when character profile request fails', async () => {
    fetchMock.mockImplementation(async () => new Response('not found', { status: 404 }))

    await expect(
      utils.getCharacterProfile('abc', 'us', 'Stormrage', 'Missing', 'en_US', 'profile-us')
    ).rejects.toThrow('Failed to fetch character profile: 404')
  })

  it('retrieves a PvP bracket', async () => {
    const body = { bracket: '2v2' }

    fetchMock.mockImplementation(async (input, init) => {
      expect(init?.headers?.Authorization).toBe('Bearer abc')
      expect(String(input)).toContain('/pvp-bracket/2v2')
      return jsonResponse(body)
    })

    const result = await utils.getPvPBracket(
      'abc',
      'us',
      'Stormrage',
      'TestChar',
      '2v2',
      'en_US',
      'profile-us'
    )
    expect(result).toEqual(body)
  })

  it('throws when PvP bracket request fails', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }))

    await expect(
      utils.getPvPBracket('abc', 'us', 'Stormrage', 'TestChar', '3v3', 'en_US', 'profile-us')
    ).rejects.toThrow('Failed to fetch PvP bracket 3v3: 500')
  })
})

describe('extractBracketTypeFromHref', () => {
  it('extracts bracket type from href', async () => {
    expect(
      utils.extractBracketTypeFromHref(
        'https://us.api.blizzard.com/profile/wow/character/stormrage/test/pvp-bracket/3v3?namespace=profile-us'
      )
    ).toBe('3v3')
  })

  it('returns empty string when href does not match expected pattern', async () => {
    expect(utils.extractBracketTypeFromHref('https://example.com/no-bracket')).toBe('')
  })
})
