import { afterEach, describe, expect, it, mock } from 'bun:test'
import { ApiError } from '../src/v1/utils/errors'
import { createCharacterService } from '../src/v1/services/character-service'
import { createCharacterMediaService } from '../src/v1/services/character-media-service'
import {
  createCharacterFullService,
  CharacterFullSection,
  isCharacterFullSection
} from '../src/v1/services/character-full-service'
import { createEquipmentService } from '../src/v1/services/equipment-service'
import { createMythicPlusService } from '../src/v1/services/mythic-plus-service'
import { createMythicPlusLeaderboardService } from '../src/v1/services/mythic-plus-leaderboard-service'
import { createRaidService } from '../src/v1/services/raid-service'
import { createRealmService } from '../src/v1/services/realm-service'
import { createPvpLeaderboardService } from '../src/v1/services/pvp-leaderboard-service'
import { getGameConfig } from '../src/v1/utils/game-config'
import { cache } from '../src/cache'
import { buildCacheKey } from '../src/v1/utils/cache'

type FetchJson = Parameters<typeof createCharacterService>[0]['fetchJson']

function createClient(fetchJson: FetchJson) {
  return {
    fetchJson
  } as any
}

function clearCacheKey(parts: string[]) {
  const key = buildCacheKey(parts)
  cache.delete(key)
}

function mockCacheMeta(overrides: Partial<{
  key: string
  cached: boolean
  ttlMs: number
  expiresAt: number | null
  fetchedAt: number | null
  ageMs: number | null
}> = {}) {
  return {
    key: 'cache:test/meta',
    cached: false,
    ttlMs: 300000,
    expiresAt: 1_700_000_000_000,
    fetchedAt: 1_699_999_700_000,
    ageMs: 300000,
    ...overrides
  }
}

const retailConfig = getGameConfig('retail')

afterEach(() => {
  retailConfig.supportsProfiles = true
})

function clearPvpLeaderboardCache(game: string, seasonId: number, bracket: string) {
  cache.delete(buildCacheKey(['leaderboard', 'pvp', game, 'us', `season-${seasonId}`, bracket]))
  cache.delete(buildCacheKey(['pvp-season', game, 'us', 'current']))
  cache.delete(buildCacheKey(['pvp-season', game, 'us', 'current-id']))
  cache.delete(buildCacheKey(['pvp-season', game, 'us', 'current-id', 'v2']))
  cache.delete(buildCacheKey(['pvp-season', game, 'us', seasonId.toString(), 'details']))
}

function clearMythicLeaderboardCache(keySuffixes: string[]) {
  cache.delete('mythic-plus:us:current-season')
  cache.delete('mythic-plus:us:40:details')
  for (const suffix of keySuffixes) {
    cache.delete(suffix)
  }
}

describe('PvpLeaderboardService#getLeaderboard', () => {
  const seasonId = 40
  const leaderboardPath = `/data/wow/pvp-season/current/pvp-leaderboard/2v2`
  const leaderboardPathById = `/data/wow/pvp-season/${seasonId}/pvp-leaderboard/2v2`

  function createPvpClient(responses: Record<string, any>) {
    const fetchJsonMock = mock(async (path: string) => {
      const normalizedPath = path.toString()
      if (!(normalizedPath in responses)) {
        throw new Error(`Unexpected fetch path: ${normalizedPath}`)
      }
      return responses[normalizedPath]
    }) as FetchJson

    return createClient(fetchJsonMock)
  }

  it('normalizes leaderboard entries and paginates results', async () => {
    clearPvpLeaderboardCache('retail', seasonId, '2v2')

    const leaderboardResponse = {
      name: '2v2',
      entries: [
        {
          rank: 1,
          rating: 3025,
          character: {
            id: 1001,
            name: 'Champion',
            realm: { id: 3676, name: 'Area 52', slug: 'area-52' }
          },
          playable_class: { id: 2, name: 'Paladin' },
          spec: { id: 65, name: 'Holy' },
          faction: { type: 'ALLIANCE' },
          season_match_statistics: { won: 80, lost: 20, played: 100 }
        },
        {
          rank: 2,
          rating: 2980,
          character: {
            id: 1002,
            name: 'Healer',
            realm: { id: 1427, name: 'Stormrage', slug: 'stormrage' }
          },
          playable_class: { id: 11, name: 'Druid' },
          spec: { id: 105, name: 'Restoration' },
          faction: { name: 'Horde' },
          season_match_statistics: { won: 70, lost: 30, played: 100 }
        }
      ],
      last_updated_timestamp: Date.UTC(2025, 9, 1, 12, 0, 0)
    }

    const client = createPvpClient({
      '/data/wow/pvp-season/index': { current_season: { id: seasonId } },
      [`/data/wow/pvp-season/${seasonId}`]: {
        id: seasonId,
        name: 'Season 1',
        slug: 'season-1',
        start_timestamp: Date.UTC(2025, 8, 17)
      },
      [leaderboardPath]: leaderboardResponse,
      [leaderboardPathById]: leaderboardResponse
    })

    const service = createPvpLeaderboardService(client as any)
    const result = await service.getLeaderboard('retail', 'us', 'en_US', {
      bracket: '2v2',
      limit: 1
    })

    expect(result.value.entries).toHaveLength(1)
    expect(result.value.entries[0].character.class.slug).toBe('paladin')
    expect(result.value.entries[0].statistics.winRate).toBe(80)
    expect(result.value.pagination.nextCursor).toBe('offset:1')
    expect(result.value.filters.region).toBe('us')
    expect(result.value.filters.class).toBeNull()
    expect(result.value.availableBrackets).toContain('shuffle-evoker-augmentation')
    expect(result.value.updatedAt).toBe('2025-10-01T12:00:00.000Z')
    expect(result.cacheMeta.cached).toBe(false)

    // Subsequent call should hit cache and return cached meta
    const cachedResult = await service.getLeaderboard('retail', 'us', 'en_US', {
      bracket: '2v2',
      limit: 1,
      cursor: 'offset:1'
    })
    expect(cachedResult.cacheMeta.cached).toBe(true)
    expect(cachedResult.value.entries[0].character.class.slug).toBe('druid')
  })

  it('fills missing realm, class, and spec details from alternate fields', async () => {
    clearPvpLeaderboardCache('retail', seasonId, 'shuffle-overall')

    const shufflePath = `/data/wow/pvp-season/current/pvp-leaderboard/shuffle-overall`
    const shufflePathById = `/data/wow/pvp-season/${seasonId}/pvp-leaderboard/shuffle-overall`

    const leaderboardResponse = {
      name: 'Shuffle Overall',
      entries: [
        {
          rank: 1,
          rating: 2935,
          character: {
            id: 245626609,
            name: 'Partytwo',
            realm: { id: 5, name: null, slug: 'proudmoore' },
            class: { slug: 'priest' },
            specialization: { slug: 'discipline' }
          },
          class: { slug: 'priest' },
          class_specialization: { slug: 'discipline' },
          faction: { name: 'Alliance' },
          season_match_statistics: { won: 216, lost: 176, played: 392 }
        }
      ],
      last_updated_timestamp: Date.UTC(2025, 9, 15, 10, 0, 0)
    }

    const client = createPvpClient({
      '/data/wow/pvp-season/index': { current_season: { id: seasonId } },
      [`/data/wow/pvp-season/${seasonId}`]: { id: seasonId, name: 'Season 1' },
      [shufflePath]: leaderboardResponse,
      [shufflePathById]: leaderboardResponse
    })

    const service = createPvpLeaderboardService(client as any)
    const result = await service.getLeaderboard('retail', 'us', 'en_US', {
      bracket: 'shuffle-overall'
    })

    expect(result.value.entries).toHaveLength(1)
    const entry = result.value.entries[0]
    expect(entry.character.realm.slug).toBe('proudmoore')
    expect(entry.character.realm.name).toBe('Proudmoore')
    expect(entry.character.class).toEqual({ id: 5, name: 'Priest', slug: 'priest' })
    expect(entry.character.spec).toEqual({ id: 256, name: 'Discipline', slug: 'discipline' })
    expect(entry.character.faction).toBe('alliance')
    expect(entry.statistics.played).toBe(392)
  })

  it('applies class filters and rejects ambiguous specs', async () => {
    clearPvpLeaderboardCache('retail', seasonId, '2v2')

    const leaderboardResponse = {
      entries: [
        {
          rank: 1,
          rating: 2900,
          character: {
            id: 2001,
            name: 'Totem',
            realm: { id: 60, name: 'Illidan', slug: 'illidan' }
          },
          playable_class: { id: 7, name: 'Shaman' },
          spec: { id: 264, name: 'Restoration' },
          faction: { type: 'HORDE' },
          season_match_statistics: { won: 50, lost: 10 }
        },
        {
          rank: 2,
          rating: 2850,
          character: {
            id: 2002,
            name: 'Sprout',
            realm: { id: 60, name: 'Illidan', slug: 'illidan' }
          },
          playable_class: { id: 11, name: 'Druid' },
          spec: { id: 102, name: 'Balance' },
          faction: { type: 'HORDE' },
          season_match_statistics: { won: 40, lost: 20 }
        }
      ]
    }

    const client = createPvpClient({
      '/data/wow/pvp-season/index': { current_season: { id: seasonId } },
      [`/data/wow/pvp-season/${seasonId}`]: { id: seasonId },
      [leaderboardPath]: leaderboardResponse,
      [leaderboardPathById]: leaderboardResponse
    })

    const service = createPvpLeaderboardService(client as any)

    const filtered = await service.getLeaderboard('retail', 'us', 'en_US', {
      bracket: '2v2',
      filters: { class: 'shaman' }
    })

    expect(filtered.value.entries).toHaveLength(1)
    expect(filtered.value.entries[0].character.class.slug).toBe('shaman')

    await expect(
      service.getLeaderboard('retail', 'us', 'en_US', {
        bracket: '2v2',
        filters: { spec: 'restoration' }
      })
    ).rejects.toMatchObject({ code: 'leaderboard:ambiguous_spec' })
  })

  it('supports classic-era leaderboards without shuffle brackets', async () => {
    clearPvpLeaderboardCache('classic-era', seasonId, '2v2')
    clearPvpLeaderboardCache('classic-era', seasonId, '5v5')

    const client = createPvpClient({
      '/data/wow/pvp-season/index': { seasons: [{ id: seasonId }] },
      [`/data/wow/pvp-season/${seasonId}`]: { id: seasonId, name: 'Classic Season' },
      [`/data/wow/pvp-season/${seasonId}/pvp-leaderboard/5v5`]: {
        name: '5v5',
        entries: [
          {
            rank: 1,
            rating: 2100,
            character: {
              id: 4001,
              name: 'Classicduel',
              realm: { id: 445, name: 'Whitemane', slug: 'whitemane' }
            },
            playable_class: { id: 4, name: 'Rogue' },
            spec: { id: 259, name: 'Assassination' },
            season_match_statistics: { won: 30, lost: 10 }
          }
        ]
      }
    })

    const service = createPvpLeaderboardService(client as any)
    const result = await service.getLeaderboard('classic-era', 'us', 'en_US', {
      bracket: '5v5'
    })

    expect(result.value.entries).toHaveLength(1)
    expect(result.value.availableBrackets).toContain('5v5')
    expect(result.value.availableBrackets).not.toContain('shuffle-overall')
    expect(result.value.filters.region).toBe('us')
  })
})

describe('MythicPlusLeaderboardService#getLeaderboard', () => {
  const seasonId = 40
  const seasonIndexPath = '/data/wow/mythic-keystone/season/index'
  const seasonDetailsPath = `/data/wow/mythic-keystone/season/${seasonId}`

  function createMythicClient(responses: Record<string, any>) {
    const fetchJsonMock = mock(async (path: string) => {
      const key = path.toString()
      if (!(key in responses)) {
        throw new Error(`Unexpected path: ${key}`)
      }
      return responses[key]
    }) as FetchJson

    return createClient(fetchJsonMock)
  }

  it('normalizes class leaderboards and paginates results', async () => {
    clearMythicLeaderboardCache([
      'leaderboard:mythic-plus:class:us:season-40:class-rogue'
    ])

    const client = createMythicClient({
      [seasonIndexPath]: { seasons: [{ id: 36 }, { id: seasonId }] },
      [seasonDetailsPath]: {
        id: seasonId,
        name: 'The War Within Season 1',
        slug: 'season-1-tww',
        start_timestamp: Date.UTC(2025, 8, 17)
      },
      [`/data/wow/leaderboard/mythic-plus/season/${seasonId}/class/4`]: {
        leaderboard_id: 'class-4',
        name: 'Rogue Leaderboard',
        entries: [
          {
            rank: 1,
            rating: 3175,
            keystone_level: 25,
            completed_timestamp: Date.UTC(2025, 9, 2, 15, 30),
            duration: 1_532_000,
            map: { id: 502, name: 'The Stonevault', slug: 'the-stonevault' },
            keystone_affixes: [{ id: 10, name: 'Fortified' }],
            members: [
              {
                profile: {
                  id: 9001,
                  name: 'Sneaky',
                  realm: { id: 3676, name: 'Illidan', slug: 'illidan' }
                },
                character_class: { id: 4, name: 'Rogue' },
                specialization: { id: 261, name: 'Subtlety' },
                faction: { type: 'HORDE' },
                role: { type: 'DPS' }
              }
            ]
          },
          {
            rank: 2,
            rating: 3080,
            keystone_level: 24,
            completed_timestamp: Date.UTC(2025, 9, 2, 14, 10),
            duration: 1_620_000,
            map: { id: 503, name: 'The Rookery', slug: 'the-rookery' },
            members: []
          }
        ],
        last_updated_timestamp: Date.UTC(2025, 9, 3, 12, 0)
      }
    })

    const service = createMythicPlusLeaderboardService(client as any)

    const result = await service.getLeaderboard('retail', 'us', 'en_US', {
      mode: 'class',
      classSlug: 'rogue',
      limit: 1
    })

    expect(result.value.entries).toHaveLength(1)
    expect(result.value.entries[0].members[0].class.slug).toBe('rogue')
    expect(result.value.entries[0].members[0].spec?.slug).toBe('subtlety')
    expect(result.value.entries[0].time.formatted).toBe('25:32.00')
    expect(result.value.pagination.nextCursor).toBeNull()
    expect(result.value.filters.class).toBe('rogue')
    expect(result.value.filters.spec).toBeNull()
    expect(result.value.availableClasses.find((cls) => cls.class === 'rogue')).toBeTruthy()
    expect(result.value.updatedAt).toBe('2025-10-03T12:00:00.000Z')
    expect(result.cacheMeta.cached).toBe(false)

    const cached = await service.getLeaderboard('retail', 'us', 'en_US', {
      mode: 'class',
      classSlug: 'rogue',
      cursor: 'offset:1',
      limit: 1
    })
    expect(cached.cacheMeta.cached).toBe(true)
    expect(cached.value.entries[0].rank).toBe(1)
  })

  it('filters dungeon leaderboards by role and faction', async () => {
    clearMythicLeaderboardCache([
      'leaderboard:mythic-plus:dungeon:us:season-40:cr-3676:dungeon-502:period-900'
    ])

    const client = createMythicClient({
      [seasonIndexPath]: { seasons: [{ id: seasonId }] },
      [seasonDetailsPath]: { id: seasonId },
      '/data/wow/connected-realm/3676/mythic-leaderboard/502/period/900': {
        leaderboard_id: 'cr-3676-502-900',
        entries: [
          {
            rank: 1,
            rating: 3050,
            keystone_level: 24,
            completed_timestamp: Date.UTC(2025, 9, 1, 18, 0),
            duration: 1_580_000,
            members: [
              {
                profile: {
                  id: 7001,
                  name: 'Treeheals',
                  realm: { id: 3676, name: 'Illidan', slug: 'illidan' }
                },
                character_class: { id: 11, name: 'Druid' },
                specialization: { id: 105, name: 'Restoration' },
                faction: { name: 'Alliance' },
                role: { type: 'HEALER' }
              }
            ]
          },
          {
            rank: 2,
            rating: 2990,
            keystone_level: 23,
            completed_timestamp: Date.UTC(2025, 9, 1, 17, 30),
            duration: 1_640_000,
            members: [
              {
                profile: {
                  id: 7002,
                  name: 'Stabbin',
                  realm: { id: 3676, name: 'Illidan', slug: 'illidan' }
                },
                character_class: { id: 4, name: 'Rogue' },
                specialization: { id: 261, name: 'Subtlety' },
                faction: { type: 'HORDE' },
                role: { type: 'DPS' }
              }
            ]
          }
        ]
      }
    })

    const service = createMythicPlusLeaderboardService(client as any)

    const result = await service.getLeaderboard('retail', 'us', 'en_US', {
      mode: 'dungeon',
      connectedRealmId: 3676,
      dungeonId: 502,
      periodId: 900,
      role: 'healer',
      faction: 'alliance'
    })

    expect(result.value.entries).toHaveLength(1)
    expect(result.value.entries[0].members[0].role).toBe('healer')
    expect(result.value.filters.role).toBe('healer')
    expect(result.value.filters.faction).toBe('alliance')
  })

  it('validates required filters for dungeon leaderboards', async () => {
    clearMythicLeaderboardCache([])

    const client = createMythicClient({
      [seasonIndexPath]: { seasons: [{ id: seasonId }] },
      [seasonDetailsPath]: { id: seasonId }
    })

    const service = createMythicPlusLeaderboardService(client as any)

    await expect(
      service.getLeaderboard('retail', 'us', 'en_US', {
        mode: 'dungeon',
        dungeonId: 502,
        periodId: 900
      })
    ).rejects.toMatchObject({ code: 'leaderboard:dungeon_filters_required' })
  })
})

describe('CharacterService#getCharacterSummary', () => {
  it('normalizes profile data and falls back for missing values', async () => {
    const profileResponse = {
      name: 'Testchar',
      realm: {
        name: 'Stormrage',
        slug: 'stormrage',
        nameLocalized: 'Stormrage (US)',
        nameSlug: 'stormrage-slug'
      },
      level: 70,
      character_level: 69,
      faction: { name: 'Alliance', type: 'ALLIANCE' },
      race: 'Human',
      class: { name: 'Warrior' },
      character_class: { name: 'Fighter' },
      active_spec: { name: 'Arms' },
      active_specialization_name: 'Spec Name',
      average_item_level: 440,
      equipped_item_level: 435,
      last_login: '2024-01-01T12:34:56Z'
    }

    const fetchJsonMock = mock(async () => profileResponse)
    const service = createCharacterService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'testchar', 'profile'])

    const result = await service.getCharacterSummary(
      'retail',
      'us',
      'Stormrage',
      'Testchar',
      'en_US'
    )

    expect(result.value).toEqual({
      name: 'Testchar',
      realm: 'Stormrage',
      realmSlug: 'stormrage',
      level: 70,
      faction: 'Alliance',
      race: 'Human',
      characterClass: 'Warrior',
      activeSpec: 'Arms',
      itemLevel: { average: 440, equipped: 435 },
      lastLoginTimestamp: Date.parse('2024-01-01T12:34:56Z')
    })
    expect(result.cacheMeta.cached).toBe(false)
  })

  it('returns null for optional values when profile data is absent', async () => {
    const profileResponse = {
      name: 'Emptychar',
      realm: { name: 'Stormrage' },
      character_level: null,
      faction_name: ' ',
      race: null,
      character_class_name: '',
      active_spec: undefined,
      average_item_level: null,
      equipped_item_level: null,
      last_login: 'invalid-date'
    }

    const fetchJsonMock = mock(async () => profileResponse)
    const service = createCharacterService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'emptychar', 'profile'])

    const result = await service.getCharacterSummary(
      'retail',
      'us',
      'Stormrage',
      'Emptychar',
      'en_US'
    )

    expect(result.value.faction).toBeNull()
    expect(result.value.race).toBeNull()
    expect(result.value.characterClass).toBeNull()
    expect(result.value.activeSpec).toBeNull()
    expect(result.value.itemLevel).toBeNull()
    expect(result.value.lastLoginTimestamp).toBeNull()
    expect(result.cacheMeta.cached).toBe(false)
  })

  it('returns null timestamps when no login information is available', async () => {
    const profileResponse = {
      name: 'Timestampless',
      realm: { name: 'Stormrage' },
      last_login: '   '
    }

    const fetchJsonMock = mock(async () => profileResponse)
    const service = createCharacterService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'timestampless', 'profile'])

    const result = await service.getCharacterSummary(
      'retail',
      'us',
      'Stormrage',
      'Timestampless',
      'en_US'
    )

    expect(result.value.lastLoginTimestamp).toBeNull()
  })

  it('rethrows ApiError instances from the Battle.net client', async () => {
    const apiError = new ApiError({
      status: 404,
      code: 'not-found',
      message: 'Missing'
    })

    const fetchJsonMock = mock(async () => {
      throw apiError
    })

    const service = createCharacterService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'missing', 'profile'])

    await expect(
      service.getCharacterSummary('retail', 'us', 'Stormrage', 'Missing', 'en_US')
    ).rejects.toBe(apiError)
  })

  it('wraps unexpected errors in an ApiError with context', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('boom')
    })

    const service = createCharacterService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'broken', 'profile'])

    await expect(
      service.getCharacterSummary('retail', 'us', 'Stormrage', 'Broken', 'en_US')
    ).rejects.toMatchObject({
      code: 'character:summary_failed',
      details: { realmSlug: 'Stormrage', name: 'Broken' }
    })
  })

  it('rejects games that do not yet support profile APIs', async () => {
    retailConfig.supportsProfiles = false
    const service = createCharacterService(createClient(mock(async () => ({}))))

    await expect(
      service.getCharacterSummary('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'game:not_yet_supported'
    })
  })
})

describe('CharacterService#getCharacterPvp', () => {
  it('collects PvP data across brackets with alias resolution and fallbacks', async () => {
    const summaryResponse = {
      honor_level: 55,
      pvp_honorable_kills: 1234,
      brackets: [
        { href: '/profile/wow/character/stormrage/testchar/pvp-bracket/2v2' },
        { href: '/profile/wow/character/stormrage/testchar/pvp-bracket/3v3' },
        { href: '/profile/wow/character/stormrage/testchar/pvp-bracket/shuffle-overall' }
      ]
    }

    const fetchJsonMock = mock(async (path: string) => {
      if (path.endsWith('/pvp-summary')) {
        return summaryResponse
      }
      if (path.includes('/pvp-bracket/2v2')) {
        return {
          rating: 1800,
          season_match_statistics: { won: 10, lost: 5, played: 15 }
        }
      }
      if (path.includes('/pvp-bracket/3v3')) {
        return {
          rating: 1900,
          season_match_statistics: { won: 6, lost: 4 }
        }
      }
      if (path.includes('/pvp-bracket/shuffle-overall')) {
        throw new ApiError({ status: 404, code: 'missing', message: 'Not found' })
      }
      throw new Error(`Unexpected fetch path ${path}`)
    })

    const service = createCharacterService(createClient(fetchJsonMock))

    clearCacheKey([
      'character',
      'retail',
      'us',
      'en_us',
      'stormrage',
      'testchar',
      'pvp',
      'shuffle-overall|2v2|2v2'
    ])

    const result = await service.getCharacterPvp(
      'retail',
      'us',
      'Stormrage',
      'Testchar',
      'en_US',
      ['solo_shuffle', '', '2v2', '2V2']
    )

    expect(result.value.honor).toEqual({ level: 55, honorableKills: 1234 })
    expect(result.value.season).toHaveLength(2)
    const shuffleEntry = result.value.season.find((entry) => entry.bracket === 'solo_shuffle')
    expect(shuffleEntry).toEqual({
      bracket: 'solo_shuffle',
      rating: null,
      won: 0,
      lost: 0,
      played: 0,
      winRate: null
    })
    const twovtwo = result.value.season.find((entry) => entry.bracket === '2v2')
    expect(twovtwo?.winRate).toBeCloseTo(66.7, 1)
  })

  it('rethrows ApiErrors from downstream bracket requests', async () => {
    const error = new ApiError({ status: 500, code: 'bnet:fail', message: 'fail' })

    const fetchJsonMock = mock(async (path: string) => {
      if (path.endsWith('/pvp-summary')) {
        return { brackets: [] }
      }
      throw error
    })

    const service = createCharacterService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'testchar', 'pvp', '2v2'])

    await expect(
      service.getCharacterPvp('retail', 'us', 'stormrage', 'Testchar', 'en_US', ['2v2'])
    ).rejects.toBe(error)
  })

  it('wraps unexpected errors when PvP summary retrieval fails', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('nope')
    })

    const service = createCharacterService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'en_us', 'stormrage', 'testchar', 'pvp', 'all'])

    await expect(
      service.getCharacterPvp('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'character:pvp_failed'
    })
  })

  it('rejects PvP requests for games without profile support', async () => {
    retailConfig.supportsProfiles = false
    const service = createCharacterService(createClient(mock(async () => ({}))))

    await expect(
      service.getCharacterPvp('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'game:not_yet_supported'
    })
  })
})

describe('EquipmentService#getEquipment', () => {
  it('normalizes equipment data from Battle.net responses', async () => {
    const equipmentResponse = {
      average_item_level: 450,
      equipped_item_level: 445,
      equipped_items: [
        {
          slot: { type: 'HEAD' },
          item: { id: 12345 },
          name: 'Helm of the Brave',
          quality: { type: 'EPIC' },
          level: { value: 447 },
          enchantments: [{ display_string: 'Embellishment of Glory' }, { display_string: '' }],
          sockets: [{ item: { id: 6789 } }, {}],
          bonus_list: [12, 34]
        }
      ]
    }

    const fetchJsonMock = mock(async () => equipmentResponse)
    const service = createEquipmentService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharEquip1', 'equipment'])

    const result = await service.getEquipment(
      'retail',
      'us',
      'stormrage',
      'TestcharEquip1',
      'en_US'
    )

    expect(result.value).toEqual({
      averageItemLevel: 450,
      equippedItemLevel: 445,
      items: [
        {
          slot: 'head',
          itemId: 12345,
          name: 'Helm of the Brave',
          quality: 'epic',
          level: 447,
          enchantments: ['Embellishment of Glory'],
          gems: [6789],
          bonus: 'Bonus IDs: 12,34'
        }
      ]
    })
    expect(result.cacheMeta.cached).toBe(false)
  })

  it('gracefully handles missing optional fields', async () => {
    const equipmentResponse = {
      equipped_items: [
        {
          slot: { type: 'FINGER_1' },
          item: { id: 999 },
          quality: { type: 'RARE' }
        }
      ]
    }

    const fetchJsonMock = mock(async () => equipmentResponse)
    const service = createEquipmentService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharEquip2', 'equipment'])

    const result = await service.getEquipment(
      'retail',
      'us',
      'stormrage',
      'TestcharEquip2',
      'en_US'
    )

    expect(result.value.items[0]).toEqual({
      slot: 'finger1',
      itemId: 999,
      name: 'Unknown Item',
      quality: 'rare',
      level: 0,
      enchantments: [],
      gems: []
    })
  })

  it('rethrows ApiErrors from the Battle.net client', async () => {
    const error = new ApiError({
      status: 404,
      code: 'bnet:not_found',
      message: 'missing'
    })

    const fetchJsonMock = mock(async () => {
      throw error
    })

    const service = createEquipmentService(createClient(fetchJsonMock))

    await expect(
      service.getEquipment('retail', 'us', 'stormrage', 'TestcharError', 'en_US')
    ).rejects.toBe(error)
  })

  it('wraps unexpected errors with a descriptive ApiError', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('downstream failure')
    })

    const service = createEquipmentService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'Testchar', 'equipment'])

    await expect(
      service.getEquipment('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'character:equipment_failed',
      details: { realmSlug: 'stormrage', name: 'Testchar' }
    })
  })

  it('rejects requests for games without profile support', async () => {
    retailConfig.supportsProfiles = false

    const fetchJsonMock = mock(async () => ({}))
    const service = createEquipmentService(createClient(fetchJsonMock))

    await expect(
      service.getEquipment('retail', 'us', 'stormrage', 'TestcharUnsupported', 'en_US')
    ).rejects.toMatchObject({
      code: 'game:not_yet_supported'
    })
  })
})

describe('CharacterMediaService#getCharacterMedia', () => {
  it('maps Battle.net media assets into flattened fields', async () => {
    const response = {
      assets: [
        { key: 'avatar', value: 'https://media/avatar.jpg' },
        { key: 'inset', value: 'https://media/bust.jpg' },
        { key: 'main-raw', value: 'https://media/render.png' },
        { key: 'extra', value: 'https://media/extra.png' }
      ]
    }

    const fetchJsonMock = mock(async () => response)
    const service = createCharacterMediaService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharMedia1', 'media'])

    const result = await service.getCharacterMedia(
      'retail',
      'us',
      'stormrage',
      'TestcharMedia1',
      'en_US'
    )

    expect(result.value.avatar).toBe('https://media/avatar.jpg')
    expect(result.value.bust).toBe('https://media/bust.jpg')
    expect(result.value.render).toBe('https://media/render.png')
    expect(result.value.mainRaw).toBe('https://media/render.png')
    expect(result.value.assets).toHaveLength(4)
  })

  it('returns nulls when media assets are missing', async () => {
    const fetchJsonMock = mock(async () => ({ assets: [] }))
    const service = createCharacterMediaService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharMedia2', 'media'])

    const result = await service.getCharacterMedia(
      'retail',
      'us',
      'stormrage',
      'TestcharMedia2',
      'en_US'
    )

    expect(result.value.avatar).toBeNull()
    expect(result.value.assets).toEqual([])
  })

  it('rethrows ApiErrors from the Battle.net client', async () => {
    const error = new ApiError({ status: 404, code: 'missing', message: 'nope' })
    const fetchJsonMock = mock(async () => {
      throw error
    })

    const service = createCharacterMediaService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharMediaErr', 'media'])

    await expect(
      service.getCharacterMedia('retail', 'us', 'stormrage', 'TestcharMediaErr', 'en_US')
    ).rejects.toBe(error)
  })

  it('wraps unexpected errors with additional context details', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('network down')
    })

    const service = createCharacterMediaService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'Testchar', 'media'])

    await expect(
      service.getCharacterMedia('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'character:media_failed',
      details: { realmSlug: 'stormrage', name: 'Testchar' }
    })
  })

  it('rejects unsupported games', async () => {
    retailConfig.supportsProfiles = false
    const service = createCharacterMediaService(createClient(mock(async () => ({}))))

    await expect(
      service.getCharacterMedia('retail', 'us', 'stormrage', 'TestcharMediaUnsupported', 'en_US')
    ).rejects.toMatchObject({
      code: 'game:not_yet_supported'
    })
  })
})

describe('MythicPlusService#getMythicPlus', () => {
  it('flattens mythic keystone profile data and computes dungeon scores', async () => {
    const response = {
      current_mythic_rating: { rating: 2845 },
      previous_mythic_rating: { rating: 2721 },
      season_best_runs: [
        {
          dungeon: { name: 'The Stonevault', slug: 'the-stonevault' },
          keystone_level: 18,
          duration_ms: 1847000,
          completed_timestamp: 1700000000000,
          mythic_rating: { rating: 285.4 },
          keystone_affixes: [{ name: 'Tyrannical' }, { name: 'Storming' }]
        },
        {
          dungeon: { name: 'The Stonevault', slug: 'the-stonevault' },
          keystone_level: 17,
          duration_ms: 1900000,
          completed_timestamp: 1700005000000,
          mythic_rating: { rating: 272.1 },
          keystone_affixes: [{ name: 'Fortified' }]
        }
      ]
    }

    const fetchJsonMock = mock(async () => response)
    const service = createMythicPlusService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharMPlus1', 'mythic-plus'])

    const result = await service.getMythicPlus(
      'retail',
      'us',
      'stormrage',
      'TestcharMPlus1',
      'en_US'
    )

    expect(result.value.currentScore).toBe(2845)
    expect(result.value.previousScore).toBe(2721)
    expect(result.value.bestRuns).toHaveLength(2)
    expect(result.value.bestRuns[0].affixes).toContain('Tyrannical')
    expect(result.value.dungeonScores['the-stonevault'].tyrannical).toBe(285.4)
    expect(result.value.dungeonScores['the-stonevault'].fortified).toBe(272.1)
    expect(result.value.dungeonScores['the-stonevault'].best).toBeGreaterThanOrEqual(285.4)
  })

  it('handles missing optional fields gracefully', async () => {
    const fetchJsonMock = mock(async () => ({}))
    const service = createMythicPlusService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharMPlus2', 'mythic-plus'])

    const result = await service.getMythicPlus(
      'retail',
      'us',
      'stormrage',
      'TestcharMPlus2',
      'en_US'
    )

    expect(result.value.currentScore).toBeNull()
    expect(result.value.bestRuns).toEqual([])
    expect(result.value.dungeonScores).toEqual({})
  })

  it('rethrows ApiErrors from the Battle.net client', async () => {
    const error = new ApiError({ status: 404, code: 'missing', message: 'nope' })
    const fetchJsonMock = mock(async () => {
      throw error
    })

    const service = createMythicPlusService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharMPlusErr', 'mythic-plus'])

    await expect(
      service.getMythicPlus('retail', 'us', 'stormrage', 'TestcharMPlusErr', 'en_US')
    ).rejects.toBe(error)
  })

  it('wraps unexpected errors with contextual ApiError metadata', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('timeout')
    })

    const service = createMythicPlusService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'Testchar', 'mythic-plus'])

    await expect(
      service.getMythicPlus('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'character:mythic_plus_failed',
      details: { realmSlug: 'stormrage', name: 'Testchar' }
    })
  })

  it('computes dungeon scores for runs without affix markers and preserves best values', async () => {
    const response = {
      season_best_runs: [
        {
          dungeon: { name: 'Vault of Keys' },
          keystone_level: 12,
          duration: 1200000,
          completed_timestamp: '2024-01-01T00:00:00Z',
          mythic_rating: { rating: 150 },
          keystone_affixes: []
        },
        {
          dungeon: { name: 'Vault of Keys' },
          keystone_level: 14,
          duration_ms: 1400000,
          completed_timestamp: 1700000000000,
          mythic_rating: { rating: 100 },
          keystone_affixes: [{ name: 'TYRANNICAL' }]
        },
        {
          dungeon: { name: 'Vault of Keys' },
          keystone_level: 15,
          duration_ms: 1500000,
          completed_timestamp: 1700005000000,
          mythic_rating: { rating: null },
          keystone_affixes: [{ name: 'Tyrannical' }]
        },
        {
          dungeon: { name: 'Vault of Keys' },
          keystone_level: 16,
          duration_ms: 1600000,
          completed_timestamp: 'not-a-date',
          mythic_rating: { rating: 200 },
          keystone_affixes: [{ name: 'tyrannical' }]
        },
        {
          dungeon: { name: 'Vault of Keys' },
          keystone_level: 10,
          duration_ms: 1100000,
          completed_timestamp: null,
          mythic_rating: { rating: 50 },
          keystone_affixes: []
        }
      ]
    }

    const fetchJsonMock = mock(async () => response)
    const service = createMythicPlusService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'Testchar', 'mythic-plus'])

    const result = await service.getMythicPlus(
      'retail',
      'us',
      'stormrage',
      'Testchar',
      'en_US'
    )

    const mythicPlus = result.value

    expect(Object.keys(mythicPlus.dungeonScores)).toContain('vault-of-keys')
    const dungeon = mythicPlus.dungeonScores['vault-of-keys']
    expect(dungeon.tyrannical).toBe(200)
    expect(dungeon.best).toBe(200)
    expect(mythicPlus.bestRuns[0].completedAt).toBe('2024-01-01T00:00:00.000Z')
    expect(mythicPlus.bestRuns[2].completedAt).toBe('2023-11-14T23:36:40.000Z')
    expect(mythicPlus.bestRuns[3].completedAt).toBeNull()
    expect(mythicPlus.bestRuns[4].completedAt).toBeNull()
  })

  it('rejects unsupported games', async () => {
    retailConfig.supportsProfiles = false
    const service = createMythicPlusService(createClient(mock(async () => ({}))))

    await expect(
      service.getMythicPlus('retail', 'us', 'stormrage', 'TestcharMPlusUnsupported', 'en_US')
    ).rejects.toMatchObject({
      code: 'game:not_yet_supported'
    })
  })
})

describe('RaidService#getRaidProgress', () => {
  it('maps raid encounter progression into summaries', async () => {
    const response = {
      expansions: [
        {
          expansion: { name: 'The War Within' },
          instances: [
            {
              instance: { id: 123, name: 'Nerub-ar Palace', slug: 'nerub-ar-palace' },
              modes: [
                {
                  difficulty: { type: 'MYTHIC' },
                  progress: { completed_count: 3, total_count: 8 },
                  encounters: [
                    {
                      encounter: { id: 1, name: 'Ulgrax the Devourer', slug: 'ulgrax' },
                      completed_count: 1,
                      last_kill_timestamp: 1700000000000
                    }
                  ]
                },
                {
                  difficulty: { type: 'HEROIC' },
                  progress: { completed_count: 7, total_count: 8 },
                  encounters: [
                    {
                      encounter: { id: 1, name: 'Ulgrax the Devourer', slug: 'ulgrax' },
                      completed_count: 1,
                      last_kill_timestamp: 1699990000000
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }

    const fetchJsonMock = mock(async () => response)
    const service = createRaidService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharRaid1', 'raids'])

    const result = await service.getRaidProgress(
      'retail',
      'us',
      'stormrage',
      'TestcharRaid1',
      'en_US'
    )

    expect(result.value.raids).toHaveLength(1)
    const raid = result.value.raids[0]
    expect(raid.name).toBe('Nerub-ar Palace')
    expect(raid.progress.mythic?.completed).toBe(3)
    expect(raid.bosses[0].mythic?.killed).toBe(true)
    expect(raid.bosses[0].heroic?.killed).toBe(true)
  })

  it('handles missing modes by returning empty arrays', async () => {
    const fetchJsonMock = mock(async () => ({ expansions: [] }))
    const service = createRaidService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharRaid2', 'raids'])

    const result = await service.getRaidProgress(
      'retail',
      'us',
      'stormrage',
      'TestcharRaid2',
      'en_US'
    )

    expect(result.value.raids).toEqual([])
  })

  it('rethrows ApiErrors from the Battle.net client', async () => {
    const error = new ApiError({ status: 404, code: 'missing', message: 'nope' })
    const fetchJsonMock = mock(async () => {
      throw error
    })

    const service = createRaidService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'TestcharRaidErr', 'raids'])

    await expect(
      service.getRaidProgress('retail', 'us', 'stormrage', 'TestcharRaidErr', 'en_US')
    ).rejects.toBe(error)
  })

  it('wraps unexpected errors produced by the Battle.net client', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('gateway timeout')
    })

    const service = createRaidService(createClient(fetchJsonMock))
    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'Testchar', 'raids'])

    await expect(
      service.getRaidProgress('retail', 'us', 'stormrage', 'Testchar', 'en_US')
    ).rejects.toMatchObject({
      code: 'character:raids_failed',
      details: { realmSlug: 'stormrage', name: 'Testchar' }
    })
  })

  it('normalizes encounters lacking identifiers and difficulty metadata', async () => {
    const response = {
      expansions: [
        {
          name: 'Legacy Expansion',
          instances: [
            {
              id: 999,
              name: 'Vault of Memories',
              modes: [
                {
                  difficulty: { type: 'NORMAL' },
                  progress: {},
                  encounters: [
                    {
                      encounter: { slug: 'lurking-shadow' },
                      completed_count: 1,
                      last_kill_timestamp: '2024-02-01T12:00:00Z'
                    },
                    {
                      encounter: { slug: 'lurking-shadow' },
                      completed_count: 0,
                      last_kill_timestamp: '2024-02-01T12:00:00Z'
                    }
                  ]
                },
                {
                  difficulty: { name: 'heroic challenge' },
                  progress: { kill_count: 2, total_count: 3 },
                  encounters: [
                    {
                      encounter: { name: 'Forgotten Warden' },
                      completed_count: 0
                    }
                  ]
                },
                {
                  difficulty: { type: 'Mythic raid' },
                  encounters: [
                    {
                      completed_count: 1,
                      last_kill_timestamp: 1700000000000
                    }
                  ]
                },
                {
                  difficulty: { type: 'NORMAL' },
                  encounters: [
                    {
                      encounter: {},
                      completed_count: 0
                    }
                  ]
                },
                {
                  encounters: [
                    {
                      encounter: { name: 'Ignored Boss' }
                    }
                  ]
                },
                {
                  difficulty: { type: 'story' },
                  encounters: [
                    {
                      encounter: { id: 1234 },
                      completed_count: 1
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }

    const fetchJsonMock = mock(async () => response)
    const service = createRaidService(createClient(fetchJsonMock))

    clearCacheKey(['character', 'retail', 'us', 'stormrage', 'Testchar', 'raids'])

    const result = await service.getRaidProgress('retail', 'us', 'stormrage', 'Testchar', 'en_US')

    expect(result.value.raids).toHaveLength(1)
    const raid = result.value.raids[0]
    expect(raid.expansion).toBe('Legacy Expansion')
    expect(raid.progress.normal).toMatchObject({ completed: 1, total: 2, percentage: 50 })
    expect(raid.progress.heroic).toBeNull()
    expect(raid.progress.mythic).toBeNull()
    expect(raid.bosses).toHaveLength(3)
    const normalBoss = raid.bosses.find((boss) => boss.slug === 'lurking-shadow')
    expect(normalBoss?.normal?.firstKill).toBe('2024-02-01T12:00:00.000Z')
    const heroicBoss = raid.bosses.find((boss) => boss.name === 'Forgotten Warden')
    expect(heroicBoss?.heroic?.firstKill).toBeNull()
    expect(heroicBoss?.heroic?.killed).toBe(false)
    const mythicBoss = raid.bosses.find((boss) => Boolean(boss.mythic))
    expect(mythicBoss?.mythic?.firstKill).toBe('2023-11-14T22:13:20.000Z')
  })

  it('rejects unsupported games', async () => {
    retailConfig.supportsProfiles = false
    const service = createRaidService(createClient(mock(async () => ({}))))

    await expect(
      service.getRaidProgress('retail', 'us', 'stormrage', 'TestcharRaidUnsupported', 'en_US')
    ).rejects.toMatchObject({
      code: 'game:not_yet_supported'
    })
  })
})

describe('CharacterFullService#getCharacterFull', () => {
  it('requests all sections when none are specified', async () => {
    const fullService = createCharacterFullService({
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: { name: 'Test', realm: 'Stormrage', realmSlug: 'stormrage', level: 70 },
          cacheMeta: mockCacheMeta({ key: 'full-summary' })
        })),
        getCharacterPvp: mock(async () => ({
          value: { season: [], honor: null },
          cacheMeta: mockCacheMeta({ key: 'full-pvp' })
        }))
      } as any,
      equipmentService: {
        getEquipment: mock(async () => ({
          value: { averageItemLevel: 450, equippedItemLevel: 445, items: [] },
          cacheMeta: mockCacheMeta({ key: 'full-equipment' })
        }))
      } as any,
      mythicPlusService: {
        getMythicPlus: mock(async () => ({
          value: { currentScore: 2500, previousScore: 2400, bestRuns: [], dungeonScores: {} },
          cacheMeta: mockCacheMeta({ key: 'full-mplus' })
        }))
      } as any,
      raidService: {
        getRaidProgress: mock(async () => ({
          value: { raids: [] },
          cacheMeta: mockCacheMeta({ key: 'full-raids' })
        }))
      } as any
    })

    const result = await fullService.getCharacterFull(
      'retail',
      'us',
      'stormrage',
      'Testchar',
      'en_US',
      []
    )

    expect(result.requestedSections).toEqual(['profile', 'equipment', 'mythicPlus', 'raids', 'pvp'])
    expect(result.fulfilledSections).toEqual(['profile', 'equipment', 'mythicPlus', 'raids', 'pvp'])
    expect(result.profile).toBeTruthy()
    expect(result.equipment?.averageItemLevel).toBe(450)
    expect(result.mythicPlus?.currentScore).toBe(2500)
    expect(result.raids).toEqual({ raids: [] })
    expect(result.pvp).toEqual({ season: [], honor: null })
  })

  it('aggregates multiple sections and reports results', async () => {
    const fullService = createCharacterFullService({
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: { name: 'Test', realm: 'Stormrage', realmSlug: 'stormrage', level: 70 },
          cacheMeta: mockCacheMeta({ key: 'test-summary' })
        })),
        getCharacterPvp: mock(async () => ({
          value: { season: [], honor: null },
          cacheMeta: mockCacheMeta({ key: 'test-pvp' })
        }))
      } as any,
      equipmentService: {
        getEquipment: mock(async () => ({
          value: { averageItemLevel: 450, equippedItemLevel: 445, items: [] },
          cacheMeta: {
            key: 'test-equipment',
            cached: false,
            ttlMs: 0,
            expiresAt: null,
            fetchedAt: null,
            ageMs: null
          }
        }))
      } as any,
      mythicPlusService: {
        getMythicPlus: mock(async () => ({
          value: { currentScore: 2500, previousScore: 2400, bestRuns: [], dungeonScores: {} },
          cacheMeta: {
            key: 'test-mplus',
            cached: false,
            ttlMs: 0,
            expiresAt: null,
            fetchedAt: null,
            ageMs: null
          }
        }))
      } as any,
      raidService: {
        getRaidProgress: mock(async () => ({
          value: { raids: [] },
          cacheMeta: {
            key: 'test-raid',
            cached: false,
            ttlMs: 0,
            expiresAt: null,
            fetchedAt: null,
            ageMs: null
          }
        }))
      } as any
    })

    const result = await fullService.getCharacterFull(
      'retail',
      'us',
      'stormrage',
      'Testchar',
      'en_US',
      ['profile', 'equipment', 'mythicPlus', 'raids', 'pvp']
    )

    expect(result.profile).toEqual({ name: 'Test', realm: 'Stormrage', realmSlug: 'stormrage', level: 70 })
    expect(result.equipment?.averageItemLevel).toBe(450)
    expect(result.mythicPlus?.currentScore).toBe(2500)
    expect(result.raids).toEqual({ raids: [] })
    expect(result.pvp).toEqual({ season: [], honor: null })
    expect(result.fulfilledSections).toEqual(['profile', 'equipment', 'mythicPlus', 'raids', 'pvp'])
    expect(result.failedSections).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('captures section failures without aborting other requests', async () => {
    const error = new ApiError({ status: 500, code: 'boom', message: 'explode' })

    const fullService = createCharacterFullService({
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: { name: 'Test', realm: 'Stormrage', realmSlug: 'stormrage', level: 70 },
          cacheMeta: mockCacheMeta({ key: 'test-summary' })
        })),
        getCharacterPvp: mock(async () => {
          throw error
        })
      } as any,
      equipmentService: {
        getEquipment: mock(async () => ({
          value: { averageItemLevel: 450, equippedItemLevel: 445, items: [] },
          cacheMeta: {
            key: 'test-equipment',
            cached: false,
            ttlMs: 0,
            expiresAt: null,
            fetchedAt: null,
            ageMs: null
          }
        }))
      } as any,
      mythicPlusService: {
        getMythicPlus: mock(async () => ({
          value: { currentScore: 2500, previousScore: 2400, bestRuns: [], dungeonScores: {} },
          cacheMeta: {
            key: 'test-mplus',
            cached: false,
            ttlMs: 0,
            expiresAt: null,
            fetchedAt: null,
            ageMs: null
          }
        }))
      } as any,
      raidService: {
        getRaidProgress: mock(async () => ({
          value: { raids: [] },
          cacheMeta: {
            key: 'test-raid',
            cached: false,
            ttlMs: 0,
            expiresAt: null,
            fetchedAt: null,
            ageMs: null
          }
        }))
      } as any
    })

    const result = await fullService.getCharacterFull(
      'retail',
      'us',
      'stormrage',
      'Testchar',
      'en_US',
      ['profile', 'pvp']
    )

    expect(result.profile).toBeDefined()
    expect(result.pvp).toBeUndefined()
    expect(result.fulfilledSections).toEqual(['profile'])
    expect(result.failedSections).toEqual(['pvp'])
    expect(result.errors[0]).toMatchObject({ section: 'pvp', code: 'boom', status: 500 })
  })

  it('records unexpected errors with a generic failure entry', async () => {
    const fullService = createCharacterFullService({
      characterService: {
        getCharacterSummary: mock(async () => ({ name: 'Test', realm: 'Stormrage', realmSlug: 'stormrage', level: 70 })),
        getCharacterPvp: mock(async () => ({ season: [], honor: null }))
      } as any,
      equipmentService: {
        getEquipment: mock(async () => {
          throw new Error('equip fail')
        })
      } as any,
      mythicPlusService: {
        getMythicPlus: mock(async () => ({ currentScore: 2500, previousScore: 2400, bestRuns: [], dungeonScores: {} }))
      } as any,
      raidService: {
        getRaidProgress: mock(async () => ({ raids: [] }))
      } as any
    })

    const result = await fullService.getCharacterFull(
      'retail',
      'us',
      'stormrage',
      'Testchar',
      'en_US',
      ['profile', 'equipment']
    )

    expect(result.fulfilledSections).toEqual(['profile'])
    expect(result.failedSections).toEqual(['equipment'])
    expect(result.errors[0]).toMatchObject({
      section: 'equipment',
      code: 'server:unexpected',
      message: 'equip fail',
      status: 500
    })
  })

  it('captures invalid section requests as ApiErrors', async () => {
    const fullService = createCharacterFullService({
      characterService: {
        getCharacterSummary: mock(async () => ({ name: 'Test', realm: 'Stormrage', realmSlug: 'stormrage', level: 70 })),
        getCharacterPvp: mock(async () => ({ season: [], honor: null }))
      } as any,
      equipmentService: {
        getEquipment: mock(async () => ({ averageItemLevel: 450, equippedItemLevel: 445, items: [] }))
      } as any,
      mythicPlusService: {
        getMythicPlus: mock(async () => ({ currentScore: 2500, previousScore: 2400, bestRuns: [], dungeonScores: {} }))
      } as any,
      raidService: {
        getRaidProgress: mock(async () => ({ raids: [] }))
      } as any
    })

    const result = await fullService.getCharacterFull(
      'retail',
      'us',
      'stormrage',
      'Testchar',
      'en_US',
      ['profile', 'unknown' as CharacterFullSection]
    )

    expect(result.fulfilledSections).toEqual(['profile'])
    expect(result.failedSections).toEqual(['unknown'])
    expect(result.errors[0]).toMatchObject({
      section: 'unknown',
      code: 'request:invalid_section',
      status: 400
    })
  })
})

describe('isCharacterFullSection', () => {
  it('identifies supported sections', () => {
    expect(isCharacterFullSection('profile')).toBe(true)
    expect(isCharacterFullSection('equipment')).toBe(true)
    expect(isCharacterFullSection('mythicPlus')).toBe(true)
    expect(isCharacterFullSection('raids')).toBe(true)
    expect(isCharacterFullSection('pvp')).toBe(true)
  })

  it('rejects unsupported section names', () => {
    expect(isCharacterFullSection('unknown')).toBe(false)
    expect(isCharacterFullSection('')).toBe(false)
  })
})

describe('RealmService', () => {
  it('maps realm index responses into summaries', async () => {
    const fetchJsonMock = mock(async () => ({
      realms: [
        {
          id: 1,
          slug: 'stormrage',
          name: 'Stormrage',
          category: 'Normal',
          nameLocalized: 'Stormrage (US)',
          timezone: 'America/Chicago',
          type: { name: 'Normal' },
          population: { name: 'High' }
        }
      ]
    }))

    const service = createRealmService(createClient(fetchJsonMock))
    clearCacheKey(['realms', 'retail', 'us', 'en_US'])

    const result = await service.listRealms('retail', 'us', 'en_US')

    expect(result.value).toEqual([
      {
        id: 1,
        slug: 'stormrage',
        name: 'Stormrage',
        category: 'Normal',
        localeName: 'Stormrage (US)',
        timezone: 'America/Chicago',
        type: 'Normal',
        population: 'High'
      }
    ])
    expect(result.cacheMeta.cached).toBe(false)
  })

  it('propagates ApiErrors thrown by the Battle.net client', async () => {
    const error = new ApiError({ status: 404, code: 'bnet:not_found', message: 'missing' })
    const fetchJsonMock = mock(async () => {
      throw error
    })

    const service = createRealmService(createClient(fetchJsonMock))
    clearCacheKey(['realms', 'retail', 'us', 'en_US'])

    await expect(service.listRealms('retail', 'us', 'en_US')).rejects.toBe(error)
  })

  it('wraps unexpected errors when realm retrieval fails', async () => {
    const fetchJsonMock = mock(async () => {
      throw new Error('downstream boom')
    })

    const service = createRealmService(createClient(fetchJsonMock))
    clearCacheKey(['realms', 'retail', 'us', 'en_US'])

    await expect(service.listRealms('retail', 'us', 'en_US')).rejects.toMatchObject({
      code: 'realm:list_failed',
      details: { region: 'us' }
    })
  })
})
