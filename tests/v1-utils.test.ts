import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { Context } from 'hono'
import { ApiError } from '../src/v1/utils/errors'

let httpUtils: typeof import('../src/v1/utils/http')
let getGameConfig: typeof import('../src/v1/utils/game-config').getGameConfig

const originalConsoleError = console.error
let consoleErrorMock: ReturnType<typeof mock>

function createContext() {
  const response: { body: any; status: number | undefined } = { body: undefined, status: undefined }

  const ctx: Partial<Context> = {
    json(body: any, status?: number) {
      response.body = body
      response.status = status
      return response as any
    }
  }

  return { ctx: ctx as Context, response }
}

beforeAll(async () => {
  httpUtils = await import('../src/v1/utils/http')
  ;({ getGameConfig } = await import('../src/v1/utils/game-config'))
})

beforeEach(() => {
  consoleErrorMock = mock(() => {})
  console.error = consoleErrorMock as any
})

afterEach(() => {
  console.error = originalConsoleError
})

describe('HTTP utility helpers', () => {
  it('wraps JSON responses via ok()', () => {
    const { ctx, response } = createContext()
    const payload = { data: { hello: 'world' }, meta: { count: 1 } }

    const result = httpUtils.ok(ctx, payload, 201)
    expect(result).toBe(response)
    expect(response.status).toBe(201)
    expect(response.body).toEqual(payload)
  })

  it('handles ApiError instances via handleError()', () => {
    const { ctx, response } = createContext()
    const error = new ApiError({
      status: 418,
      code: 'tea:no_coffee',
      message: 'Short and stout',
      details: { tip: 'handle with care' }
    })

    const result = httpUtils.handleError(ctx, error)
    expect(result).toBe(response)
    expect(response.status).toBe(418)
    expect(response.body).toEqual({
      error: {
        code: 'tea:no_coffee',
        message: 'Short and stout',
        details: { tip: 'handle with care' }
      }
    })
    expect(consoleErrorMock.mock.calls.length).toBe(0)
  })

  it('wraps unexpected errors as generic 500 responses', () => {
    const { ctx, response } = createContext()

    const err = new Error('boom')
    httpUtils.handleError(ctx, err)

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('server:unexpected')
    expect(consoleErrorMock.mock.calls[0][0]).toBe('Unhandled error')
  })

  it('parses comma-delimited query parameters into trimmed lists', () => {
    const parsed = httpUtils.parseQueryParamList('2v2,  3v3,,rbg , ')
    expect(parsed).toEqual(['2v2', '3v3', 'rbg'])
    expect(httpUtils.parseQueryParamList(undefined)).toEqual([])
  })
})

describe('game configuration', () => {
  it('provides namespace helpers and character paths for known games', () => {
    const retail = getGameConfig('retail')
    expect(retail.namespaces.profile('us')).toBe('profile-us')
    expect(retail.namespaces.dynamic('eu')).toBe('dynamic-eu')
    expect(retail.characterPath('Stormrage', 'Test Char')).toContain('stormrage/test%20char')

    const classicEra = getGameConfig('classic-era')
    expect(classicEra.namespaces.profile('us')).toBe('profile-classic-us')
    expect(classicEra.namespaces.dynamic('us')).toBe('dynamic-classic-us')
    expect(classicEra.characterPath('Bloodsail', 'Classic')).toContain('bloodsail/classic')

    const classicWotlk = getGameConfig('classic-wotlk')
    expect(classicWotlk.namespaces.profile('eu')).toBe('profile-classic1x-eu')
    expect(classicWotlk.namespaces.dynamic('eu')).toBe('dynamic-classic1x-eu')
    expect(classicWotlk.characterPath('Gehennas', 'Player')).toContain('gehennas/player')

    const classicHc = getGameConfig('classic-hc')
    expect(classicHc.namespaces.profile('us')).toBe('profile-classic-us')
    expect(classicHc.namespaces.dynamic('us')).toBe('dynamic-classic-us')
    expect(classicHc.characterPath('Skull Rock', 'Hardcore')).toContain('skull%20rock/hardcore')
  })

  it('throws an ApiError when requesting an unsupported game', () => {
    expect(() => getGameConfig('unknown-game' as any)).toThrow(ApiError)
  })
})
