import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const originalSetInterval = globalThis.setInterval
const originalDateNow = Date.now

let cacheModule: typeof import('../src/cache')
let CacheClass: new (dbPath?: string) => any
let testCache: any

beforeAll(async () => {
  const setIntervalMock = mock(() => 1 as any)

  try {
    globalThis.setInterval = setIntervalMock as any
    cacheModule = await import(`../src/cache.ts?test=${Math.random()}`)
  } finally {
    globalThis.setInterval = originalSetInterval
  }

  const intervalCallback = setIntervalMock.mock.calls[0]?.[0]
  if (typeof intervalCallback === 'function') {
    intervalCallback()
  }

  CacheClass = cacheModule.cache.constructor as unknown as new (dbPath?: string) => any
})

afterAll(() => {
  // Close the default cache instance to release the SQLite handle opened during import
  cacheModule.cache.close()
  Date.now = originalDateNow
})

beforeEach(() => {
  testCache = new CacheClass(':memory:')
  Date.now = originalDateNow
})

afterEach(() => {
  testCache.close()
})

describe('CharacterCache', () => {
  it('returns null for missing keys', () => {
    expect(testCache.get('missing')).toBeNull()
  })

  it('stores and retrieves JSON-serializable values', () => {
    const payload = { name: 'Testchar', rating: 1800 }
    testCache.set('character:test', payload, 60)

    expect(testCache.get('character:test')).toEqual(payload)
  })

  it('evicts expired entries on access', () => {
    let now = 1_000_000
    Date.now = () => now

    testCache.set('expiring', { value: 1 }, 10)
    expect(testCache.get('expiring')).toEqual({ value: 1 })

    now += 11_000
    expect(testCache.get('expiring')).toBeNull()
  })

  it('cleanup removes expired entries in bulk', () => {
  let now = 5_000_000
  Date.now = () => now

  testCache.set('keep', { value: 1 }, 60)
  testCache.set('old', { value: 2 }, 1)

  now += 2_000
  testCache.cleanup()

  expect(testCache.get('keep')).toEqual({ value: 1 })
  expect(testCache.get('old')).toBeNull()
})

  it('delete removes a specific key', () => {
    testCache.set('remove-me', { value: 42 }, 60)
    expect(testCache.get('remove-me')).not.toBeNull()

    testCache.delete('remove-me')
    expect(testCache.get('remove-me')).toBeNull()
  })
})
