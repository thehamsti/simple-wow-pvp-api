import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { ApiError } from '../src/v1/utils/errors'
import { createBattleNetClient } from '../src/v1/services/battlenet-client'

const originalFetch = globalThis.fetch
const originalEnv = {
  id: process.env.BATTLE_NET_CLIENT_ID,
  secret: process.env.BATTLE_NET_CLIENT_SECRET
}

let fetchMock: ReturnType<typeof mock>

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}

beforeEach(() => {
  process.env.BATTLE_NET_CLIENT_ID = 'test-client'
  process.env.BATTLE_NET_CLIENT_SECRET = 'test-secret'

  fetchMock = mock(async () => {
    throw new Error('Unexpected fetch call')
  })
  globalThis.fetch = fetchMock as any
})

afterEach(() => {
  globalThis.fetch = originalFetch
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
})

describe('createBattleNetClient', () => {
  it('throws when Battle.net credentials are missing', () => {
    delete process.env.BATTLE_NET_CLIENT_ID
    delete process.env.BATTLE_NET_CLIENT_SECRET

    expect(() => createBattleNetClient()).toThrow(ApiError)
  })

  it('deduplicates concurrent access token requests and caches the result', async () => {
    let tokenRequests = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        tokenRequests += 1
        return jsonResponse({ access_token: 'token-123', expires_in: 120 })
      }
      throw new Error(`Unexpected fetch for ${url}`)
    })

    const client = createBattleNetClient()

    const promiseA = client.getAccessToken('us')
    const promiseB = client.getAccessToken('us')
    const [resultA, resultB] = await Promise.all([promiseA, promiseB])

    expect(resultA.token).toBe('token-123')
    expect(resultB).toEqual(resultA)
    expect(tokenRequests).toBe(1)

    const meta = client.getTokenCacheMeta()
    expect(Object.keys(meta)).toEqual(['us'])
    expect(meta.us.expiresAt).not.toBeNull()
  })

  it('fetches JSON resources with locale and namespace parameters added when missing', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse({ access_token: 'cached-token', expires_in: 3600 })
      }

      expect(url).toContain('locale=en_US')
      expect(url).toContain('namespace=profile-us')

      return jsonResponse({ value: 42 })
    })

    const client = createBattleNetClient()
    const data = await client.fetchJson<{ value: number }>('/data/test', {
      region: 'us',
      locale: 'en_US',
      namespace: 'profile-us'
    })

    expect(data.value).toBe(42)
    expect(fetchMock.mock.calls.length).toBe(2)
  })

  it('does not duplicate query params when absolute URLs already contain values', async () => {
    let resourceUrl = ''

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse({ access_token: 'token-abs', expires_in: 3600 })
      }
      resourceUrl = url
      return jsonResponse({ ok: true })
    })

    const client = createBattleNetClient()
    await client.fetchJson('https://example.test/resource?locale=fr_FR', {
      region: 'eu',
      locale: 'fr_FR',
      namespace: 'dynamic-eu'
    })

    const parsed = new URL(resourceUrl)
    expect(parsed.searchParams.get('locale')).toBe('fr_FR')
    expect(parsed.searchParams.get('namespace')).toBe('dynamic-eu')
    expect(parsed.searchParams.getAll('locale')).toHaveLength(1)
  })

  it('raises an ApiError when token acquisition fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return new Response('forbidden', { status: 403 })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    const client = createBattleNetClient()
    await expect(client.getAccessToken('us')).rejects.toMatchObject({
      code: 'bnet:token_failed'
    })
  })

  it('wraps non-404 request failures into ApiError responses', async () => {
    let tokenIssued = false

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        tokenIssued = true
        return jsonResponse({ access_token: 'token-err', expires_in: 60 })
      }
      return new Response('bad gateway', { status: 502 })
    })

    const client = createBattleNetClient()
    await expect(
      client.fetchJson('/data/fail', { region: 'us', locale: 'en_US' })
    ).rejects.toMatchObject({
      code: 'bnet:request_failed',
      status: 502
    })
    expect(tokenIssued).toBe(true)
  })

  it('maps 404 responses to not_found ApiError code', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse({ access_token: 'token-404', expires_in: 60 })
      }
      return new Response('missing', { status: 404 })
    })

    const client = createBattleNetClient()
    await expect(
      client.fetchJson('/data/not-found', { region: 'us', locale: 'en_US' })
    ).rejects.toMatchObject({
      code: 'bnet:not_found',
      status: 404
    })
  })

  it('retries transient Battle.net errors before succeeding', async () => {
    let resourceAttempts = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse({ access_token: 'token-retry', expires_in: 3600 })
      }
      resourceAttempts += 1
      if (resourceAttempts === 1) {
        return new Response('bad gateway', { status: 502 })
      }
      return jsonResponse({ ok: true })
    })

    const client = createBattleNetClient()
    const data = await client.fetchJson<{ ok: boolean }>('/data/retry', {
      region: 'us',
      locale: 'en_US'
    })

    expect(data.ok).toBe(true)
    expect(resourceAttempts).toBe(2)
  })

  it('retries network errors before surfacing failure', async () => {
    let attempts = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        return jsonResponse({ access_token: 'token-network', expires_in: 3600 })
      }
      attempts += 1
      if (attempts === 1) {
        throw new Error('Temporary network issue')
      }
      return jsonResponse({ ok: true })
    })

    const client = createBattleNetClient()
    const data = await client.fetchJson<{ ok: boolean }>('/data/network', {
      region: 'us',
      locale: 'en_US'
    })

    expect(data.ok).toBe(true)
    expect(attempts).toBe(2)
  })

  it('retries token acquisition when transient errors occur', async () => {
    let tokenAttempts = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('oauth/token')) {
        tokenAttempts += 1
        if (tokenAttempts === 1) {
          return new Response('upstream error', { status: 502 })
        }
        return jsonResponse({ access_token: 'token-after-retry', expires_in: 120 })
      }
      return jsonResponse({ ok: true })
    })

    const client = createBattleNetClient()
    const token = await client.getAccessToken('us')

    expect(token.token).toBe('token-after-retry')
    expect(tokenAttempts).toBe(2)
  })
})
