import { describe, expect, it, mock } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import { registerCharacterRoutes } from '../src/v1/routes/characters'
import { registerEquipmentRoutes } from '../src/v1/routes/equipment'
import { registerCharacterMediaRoutes } from '../src/v1/routes/character-media'
import { registerMythicPlusRoutes } from '../src/v1/routes/mythic-plus'
import { registerRaidRoutes } from '../src/v1/routes/raids'
import { registerCharacterFullRoutes } from '../src/v1/routes/character-full'
import { registerMetaRoutes } from '../src/v1/routes/meta'
import { registerStatusRoutes } from '../src/v1/routes/status'
import { registerCacheRoutes } from '../src/v1/routes/cache'
import { registerPvpLeaderboardRoutes } from '../src/v1/routes/leaderboards-pvp'
import { registerMythicPlusLeaderboardRoutes } from '../src/v1/routes/leaderboards-mythic-plus'
import { cache } from '../src/cache'

function createCacheMeta(overrides: Partial<{
  key: string
  cached: boolean
  ttlMs: number
  expiresAt: number | null
  fetchedAt: number | null
  ageMs: number | null
}> = {}) {
  return {
    key: 'cache:test',
    cached: false,
    ttlMs: 600000,
    expiresAt: 1_700_000_000_000,
    fetchedAt: 1_699_999_400_000,
    ageMs: 1000,
    ...overrides
  }
}

describe('v1 character routes error handling', () => {
  it('returns PvP data with bracket metadata on success', async () => {
    const app = new OpenAPIHono()
    registerCharacterRoutes(app, {
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: {
            name: 'Testchar',
            realm: 'Stormrage',
            realmSlug: 'stormrage',
            level: 70
          },
          cacheMeta: createCacheMeta({ key: 'cache:summary', cached: true })
        })),
        getCharacterPvp: mock(async () => ({
          value: {
            season: [
              {
                bracket: '2v2',
                rating: 1800,
                won: 10,
                lost: 5,
                played: 15,
                winRate: 66.7
              }
            ],
            honor: { level: 50, honorableKills: 1200 }
          },
          cacheMeta: createCacheMeta({ key: 'cache:pvp', cached: false })
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/pvp?region=us&locale=en_US&brackets=2v2'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.season[0].bracket).toBe('2v2')
    expect(body.meta.brackets).toEqual(['2v2'])
    expect(body.meta.cached).toBe(false)
    expect(body.meta.cache).toEqual(
      expect.objectContaining({ key: 'cache:pvp', ttlMs: 600000 })
    )
  })

  it('returns full summary when no field filters are provided', async () => {
    const app = new OpenAPIHono()
    registerCharacterRoutes(app, {
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: {
            name: 'Testchar',
            realm: 'Stormrage',
            realmSlug: 'stormrage',
            level: 70,
            faction: 'Alliance'
          },
          cacheMeta: createCacheMeta({ key: 'cache:summary', cached: true })
        })),
        getCharacterPvp: mock(async () => ({
          value: {
            season: [],
            honor: null
          },
          cacheMeta: createCacheMeta({ key: 'cache:pvp', cached: true })
        }))
      }
    })

    const res = await app.request('/retail/characters/stormrage/testchar?region=us&locale=en_US')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.faction).toBe('Alliance')
    expect(body.meta.requestedFields).toEqual([])
    expect(body.meta.cached).toBe(true)
    expect(body.meta.cache).toEqual(expect.objectContaining({ key: 'cache:summary' }))
  })

  it('returns filtered summary data when requested', async () => {
    const app = new OpenAPIHono()
    registerCharacterRoutes(app, {
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: {
            name: 'Testchar',
            realm: 'Stormrage',
            realmSlug: 'stormrage',
            level: 70,
            faction: 'Alliance'
          },
          cacheMeta: createCacheMeta({ key: 'cache:summary', cached: false })
        })),
        getCharacterPvp: mock(async () => ({
          value: {
            season: [],
            honor: null
          },
          cacheMeta: createCacheMeta({ key: 'cache:pvp', cached: false })
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar?region=us&locale=en_US&fields=name,level'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ name: 'Testchar', level: 70 })
    expect(body.meta.requestedFields).toEqual(['name', 'level'])
    expect(body.meta.cached).toBe(false)
    expect(body.meta.cache).toEqual(expect.objectContaining({ key: 'cache:summary' }))
  })

  it('returns standardized 500 responses when summary lookups fail unexpectedly', async () => {
    const app = new OpenAPIHono()
    registerCharacterRoutes(app, {
      characterService: {
        getCharacterSummary: mock(async () => {
          throw new Error('summary failed abruptly')
        }),
        getCharacterPvp: mock(async () => ({
          season: [],
          honor: null
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar?region=us&locale=en_US&fields=name'
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })

  it('propagates errors from PvP route through error handler', async () => {
    const app = new OpenAPIHono()
    registerCharacterRoutes(app, {
      characterService: {
        getCharacterSummary: mock(async () => ({
          value: {
            name: 'Test',
            realm: 'Stormrage',
            realmSlug: 'stormrage',
            level: 70
          },
          cacheMeta: createCacheMeta({ key: 'cache:summary' })
        })),
        getCharacterPvp: mock(async () => {
          throw new Error('pvp panic')
        })
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/pvp?region=us&locale=en_US'
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})

describe('v1 PvP leaderboard routes', () => {
  it('returns paginated leaderboard data with cache metadata', async () => {
    const app = new OpenAPIHono()
    const serviceResponse = {
      season: {
        id: 40,
        name: 'The War Within: Season 1',
        slug: 'season-1-tww',
        startsAt: '2025-09-17T00:00:00.000Z',
        endsAt: null
      },
      bracket: { id: '2v2', name: '2v2' },
      entries: [
        {
          rank: 1,
          rating: 3025,
          percentile: 100,
          character: {
            id: 1001,
            name: 'Champion',
            realm: { id: 3676, name: 'Area 52', slug: 'area-52' },
            class: { id: 2, name: 'Paladin', slug: 'paladin' },
            spec: { id: 65, name: 'Holy', slug: 'holy' },
            faction: 'alliance'
          },
          statistics: {
            won: 80,
            lost: 20,
            played: 100,
            winRate: 80
          }
        }
      ],
      total: 100,
      pagination: {
        limit: 50,
        offset: 0,
        cursor: 'offset:0',
        nextCursor: 'offset:50',
        previousCursor: null
      },
      filters: {
        region: 'us',
        realm: 'area-52',
        class: 'paladin',
        spec: 'holy',
        faction: 'alliance',
        requested: { realm: 'Area 52' }
      },
      updatedAt: '2025-10-01T12:00:00.000Z',
      availableBrackets: ['2v2', '3v3']
    }

    const getLeaderboard = mock(async (_gameId, _region, _locale, options) => {
      expect(options.bracket).toBe('2v2')
      expect(options.limit).toBe(25)
      expect(options.filters).toEqual({
        realm: 'Area 52',
        class: 'paladin',
        spec: 'holy',
        faction: 'alliance'
      })
      return {
        value: serviceResponse,
        cacheMeta: createCacheMeta({ key: 'leaderboard:pvp:retail:us:season-40:2v2' })
      }
    })

    registerPvpLeaderboardRoutes(app, {
      pvpLeaderboardService: { getLeaderboard } as any
    })

    const res = await app.request(
      '/retail/leaderboards/pvp/2v2?region=us&limit=25&realm=Area%2052&class=paladin&spec=holy&faction=alliance'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.leaderboard).toBe('pvp')
    expect(body.data.entries[0].character.class.slug).toBe('paladin')
    expect(body.meta.pagination.nextCursor).toBe('offset:50')
    expect(body.meta.filters.realm).toBe('area-52')
    expect(body.meta.filters.requested.realm).toBe('Area 52')
    expect(body.meta.cached).toBe(false)
    expect(body.meta.cache.key).toBe('leaderboard:pvp:retail:us:season-40:2v2')
  })

  it('supports classic-era brackets without shuffle entries', async () => {
    const app = new OpenAPIHono()
    const serviceResponse = {
      season: { id: 12, name: 'Classic Season', slug: 'classic-s12', startsAt: null, endsAt: null },
      bracket: { id: '2v2', name: '2v2' },
      entries: [],
      total: 0,
      pagination: {
        limit: 50,
        offset: 0,
        cursor: 'offset:0',
        nextCursor: null,
        previousCursor: null
      },
      filters: {
        region: 'us',
        realm: null,
        class: null,
        spec: null,
        faction: null
      },
      updatedAt: null,
      availableBrackets: ['2v2', '3v3', 'rbg', '5v5']
    }

    registerPvpLeaderboardRoutes(app, {
      pvpLeaderboardService: {
        getLeaderboard: mock(async (gameId) => {
          expect(gameId).toBe('classic-era')
          return {
            value: serviceResponse,
            cacheMeta: createCacheMeta({ key: 'leaderboard:pvp:classic-era:us:season-12:2v2' })
          }
        })
      }
    })

    const res = await app.request('/classic-era/leaderboards/pvp/2v2?region=us')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.meta.availableBrackets).toEqual(['2v2', '3v3', 'rbg', '5v5'])
    expect(body.meta.cache.key).toBe('leaderboard:pvp:classic-era:us:season-12:2v2')
  })
})

describe('v1 Mythic+ leaderboard routes', () => {
  it('returns class leaderboard data with pagination metadata', async () => {
    const app = new OpenAPIHono()
    const serviceResponse = {
      leaderboard: { id: 'class-4', name: 'Rogue Leaderboard' },
      season: {
        id: 40,
        name: 'The War Within Season 1',
        slug: 'season-1-tww',
        startsAt: '2025-09-17T00:00:00.000Z',
        endsAt: null
      },
      mode: 'class',
      entries: [
        {
          rank: 1,
          percentile: 100,
          mythicRating: 3175,
          keystoneLevel: 25,
          completedAt: '2025-10-03T12:00:00.000Z',
          durationMs: 1_500_000,
          time: { formatted: '25:00.00', seconds: 1500 },
          dungeon: { id: 502, name: 'The Stonevault', slug: 'the-stonevault' },
          affixes: [
            { id: 10, name: 'Fortified', description: null }
          ],
          members: [
            {
              id: 9001,
              name: 'Sneaky',
              realm: { id: 3676, name: 'Illidan', slug: 'illidan' },
              class: { id: 4, name: 'Rogue', slug: 'rogue' },
              spec: { id: 261, name: 'Subtlety', slug: 'subtlety' },
              role: 'dps',
              faction: 'horde'
            }
          ]
        }
      ],
      total: 50,
      pagination: {
        limit: 25,
        offset: 0,
        cursor: 'offset:0',
        nextCursor: 'offset:25',
        previousCursor: null
      },
      filters: {
        region: 'us',
        class: 'rogue',
        spec: null,
        connectedRealmId: null,
        dungeonId: null,
        periodId: null,
        role: null,
        faction: null,
        requested: { class: 'rogue' }
      },
      updatedAt: '2025-10-03T12:00:00.000Z',
      availableClasses: [{ class: 'rogue', specs: ['assassination', 'outlaw', 'subtlety'] }]
    }

    const getLeaderboard = mock(async (_gameId, _region, _locale, options) => {
      expect(options.mode).toBe('class')
      expect(options.classSlug).toBe('rogue')
      expect(options.limit).toBe(25)
      return {
        value: serviceResponse,
        cacheMeta: createCacheMeta({ key: 'leaderboard:mythic-plus:class:us:season-40:class-rogue' })
      }
    })

    registerMythicPlusLeaderboardRoutes(app, {
      mythicPlusLeaderboardService: { getLeaderboard } as any
    })

    const res = await app.request(
      '/retail/leaderboards/mythic-plus?region=us&type=class&class=rogue&limit=25'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.mode).toBe('class')
    expect(body.data.entries[0].members[0].class.slug).toBe('rogue')
    expect(body.meta.filters.class).toBe('rogue')
    expect(body.meta.pagination.nextCursor).toBe('offset:25')
    expect(body.meta.cache.key).toBe('leaderboard:mythic-plus:class:us:season-40:class-rogue')
  })
})

describe('v1 equipment routes', () => {
  it('returns equipment data with metadata when successful', async () => {
    const app = new OpenAPIHono()
    const cacheMeta = {
      key: 'character:retail:us:stormrage:testchar:equipment',
      cached: false,
      ttlMs: 60000,
      expiresAt: 1_700_000_000_000,
      fetchedAt: 1_699_999_940_000,
      ageMs: 0
    }
    const getEquipment = mock(async () => ({
      value: {
        averageItemLevel: 450,
        equippedItemLevel: 445,
        items: [
          {
            slot: 'head',
            itemId: 123,
            name: 'Helm',
            quality: 'epic',
            level: 447,
            enchantments: [],
            gems: []
          }
        ]
      },
      cacheMeta
    }))

    registerEquipmentRoutes(app, {
      equipmentService: {
        getEquipment
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/equipment?region=us&locale=en_US'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.averageItemLevel).toBe(450)
    expect(body.meta).toEqual(
      expect.objectContaining({
        cached: false,
        region: 'us',
        cache: {
          key: cacheMeta.key,
          ttlMs: cacheMeta.ttlMs,
          ageMs: cacheMeta.ageMs,
          expiresAt: new Date(cacheMeta.expiresAt).toISOString()
        }
      })
    )
    expect(getEquipment.mock.calls[0]).toEqual([
      'retail',
      'us',
      'stormrage',
      'testchar',
      'en_US'
    ])
  })

  it('wraps equipment service errors using the shared error handler', async () => {
    const app = new OpenAPIHono()
    registerEquipmentRoutes(app, {
      equipmentService: {
        getEquipment: mock(async () => {
          throw new Error('equipment failure')
        })
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/equipment?region=us&locale=en_US'
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})

describe('v1 character media routes', () => {
  it('returns character media assets on success', async () => {
    const app = new OpenAPIHono()
    registerCharacterMediaRoutes(app, {
      mediaService: {
        getCharacterMedia: mock(async () => ({
          value: {
            avatar: 'https://media/avatar.jpg',
            bust: 'https://media/bust.jpg',
            render: 'https://media/render.png',
            mainRaw: 'https://media/render.png',
            assets: [{ key: 'avatar', value: 'https://media/avatar.jpg' }]
          },
          cacheMeta: {
            key: 'character:retail:us:stormrage:testchar:media',
            cached: false,
            ttlMs: 3_600_000,
            expiresAt: 1_700_000_000_000,
            fetchedAt: 1_700_000_000_000 - 3_600_000,
            ageMs: 0
          }
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/media?region=us&locale=en_US'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.avatar).toBe('https://media/avatar.jpg')
    expect(body.meta.cached).toBe(false)
    expect(body.meta.region).toBe('us')
    expect(body.meta.cache).toEqual(
      expect.objectContaining({ key: 'character:retail:us:stormrage:testchar:media' })
    )
  })

  it('wraps media service failures via the shared handler', async () => {
    const app = new OpenAPIHono()
    registerCharacterMediaRoutes(app, {
      mediaService: {
        getCharacterMedia: mock(async () => {
          throw new Error('media failure')
        })
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/media?region=us&locale=en_US'
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})

describe('v1 mythic plus routes', () => {
  it('returns Mythic+ data with metadata when successful', async () => {
    const app = new OpenAPIHono()
    registerMythicPlusRoutes(app, {
      mythicPlusService: {
        getMythicPlus: mock(async () => ({
          value: {
            currentScore: 2500,
            previousScore: 2400,
            bestRuns: [],
            dungeonScores: {}
          },
          cacheMeta: {
            key: 'character:retail:us:stormrage:testchar:mythic-plus',
            cached: false,
            ttlMs: 900_000,
            expiresAt: 1_700_000_000_000,
            fetchedAt: 1_700_000_000_000 - 900_000,
            ageMs: 0
          }
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/mythic-plus?region=us&locale=en_US'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.currentScore).toBe(2500)
    expect(body.meta.region).toBe('us')
    expect(body.meta.cache).toEqual(
      expect.objectContaining({ key: 'character:retail:us:stormrage:testchar:mythic-plus' })
    )
  })

  it('wraps Mythic+ service errors via the shared handler', async () => {
    const app = new OpenAPIHono()
    registerMythicPlusRoutes(app, {
      mythicPlusService: {
        getMythicPlus: mock(async () => {
          throw new Error('mythic failure')
        })
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/mythic-plus?region=us&locale=en_US'
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})

describe('v1 raid routes', () => {
  it('returns raid progression data on success', async () => {
    const app = new OpenAPIHono()
    registerRaidRoutes(app, {
      raidService: {
        getRaidProgress: mock(async () => ({
          value: {
            raids: [
              {
                id: 1,
                name: 'Nerub-ar Palace',
                slug: 'nerub',
                expansion: 'The War Within',
                progress: {
                  normal: { completed: 8, total: 8, percentage: 100 },
                  heroic: null,
                  mythic: null
                },
                bosses: []
              }
            ]
          },
          cacheMeta: {
            key: 'character:retail:us:stormrage:testchar:raids',
            cached: false,
            ttlMs: 3_600_000,
            expiresAt: 1_700_000_000_000,
            fetchedAt: 1_700_000_000_000 - 3_600_000,
            ageMs: 0
          }
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/raids?region=us&locale=en_US'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.raids[0].name).toBe('Nerub-ar Palace')
    expect(body.meta.region).toBe('us')
    expect(body.meta.cache).toEqual(
      expect.objectContaining({ key: 'character:retail:us:stormrage:testchar:raids' })
    )
  })

  it('wraps raid service errors via the shared handler', async () => {
    const app = new OpenAPIHono()
    registerRaidRoutes(app, {
      raidService: {
        getRaidProgress: mock(async () => {
          throw new Error('raid failure')
        })
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/raids?region=us&locale=en_US'
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})

describe('v1 cache routes', () => {
  it('lists cache entries with metadata', async () => {
    const app = new OpenAPIHono()
    registerCacheRoutes(app)

    const prefix = 'inspect:test'
    cache.set(`${prefix}:one`, { foo: 'bar' }, 30)
    cache.set(`${prefix}:two`, { baz: 'qux' }, 30)

    const res = await app.request(`/cache?prefix=${encodeURIComponent(prefix)}&limit=10`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    expect(body.data[0].key).toContain(prefix)
    expect(body.meta.prefix).toBe(prefix)

    cache.delete(`${prefix}:one`)
    cache.delete(`${prefix}:two`)
  })

  it('returns cache entry details when present', async () => {
    const app = new OpenAPIHono()
    registerCacheRoutes(app)

    const key = 'inspect:test:detail'
    cache.set(key, { detail: true }, 30)

    const res = await app.request(`/cache/${encodeURIComponent(key)}?includeValue=true`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.key).toBe(key)
    expect(body.data.value).toEqual({ detail: true })
    expect(body.data.cache.key).toBe(key)

    cache.delete(key)
  })
})

describe('v1 character full routes', () => {
  it('returns aggregate data with requested sections', async () => {
    const app = new OpenAPIHono()
    registerCharacterFullRoutes(app, {
      fullService: {
        getCharacterFull: mock(async () => ({
          profile: {
            name: 'Test',
            realm: 'Stormrage',
            realmSlug: 'stormrage',
            level: 70,
            faction: null,
            race: null,
            characterClass: null,
            activeSpec: null,
            itemLevel: null,
            lastLoginTimestamp: null
          },
          equipment: {
            averageItemLevel: 450,
            equippedItemLevel: 445,
            items: []
          },
          mythicPlus: {
            currentScore: 2500,
            previousScore: 2400,
            bestRuns: [],
            dungeonScores: {}
          },
          raids: undefined,
          pvp: {
            season: [],
            honor: null
          },
          requestedSections: ['profile', 'equipment', 'mythicPlus', 'pvp'],
          fulfilledSections: ['profile', 'equipment', 'mythicPlus', 'pvp'],
          failedSections: [],
          errors: []
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/full?region=us&locale=en_US&include=profile,equipment,mythic-plus,pvp'
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.profile.name).toBe('Test')
    expect(body.data.equipment.averageItemLevel).toBe(450)
    expect(body.meta.requestedSections).toEqual(['profile', 'equipment', 'mythicPlus', 'pvp'])
    expect(body.meta.upstreamCalls).toBe(4)
  })

  it('returns 400 when unsupported sections are requested', async () => {
    const app = new OpenAPIHono()
    registerCharacterFullRoutes(app, {
      fullService: {
        getCharacterFull: mock(async () => ({
          requestedSections: [],
          fulfilledSections: [],
          failedSections: [],
          errors: []
        }))
      }
    })

    const res = await app.request(
      '/retail/characters/stormrage/testchar/full?region=us&locale=en_US&include=invalid'
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('request:invalid_sections')
  })
})

describe('v1 status routes error handling', () => {
  it('reports dependency metadata when Battle.net cache meta is available', async () => {
    const app = new OpenAPIHono()
    registerStatusRoutes(app, {
      battleNetClient: {
        getTokenCacheMeta() {
          return {
            us: { expiresAt: Date.now() + 1000 }
          }
        }
      }
    })

    const res = await app.request('/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dependencies.battleNet.tokenCached).toBe(true)
    expect(body.data.dependencies.battleNet.regions[0].region).toBe('us')
  })

  it('wraps exceptions from the Battle.net client', async () => {
    const app = new OpenAPIHono()
    registerStatusRoutes(app, {
      battleNetClient: {
        getTokenCacheMeta() {
          throw new Error('status failure')
        }
      }
    })

    const res = await app.request('/status')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})

describe('v1 meta routes', () => {
  it('returns realms with contextual metadata', async () => {
    const app = new OpenAPIHono()
    registerMetaRoutes(app, {
      realmService: {
        listRealms: mock(async () => ({
          value: [
            {
              id: 1,
              slug: 'stormrage',
              name: 'Stormrage',
              category: 'Normal',
              localeName: 'Stormrage',
              timezone: 'America/Chicago',
              type: 'Normal',
              population: 'High'
            }
          ],
          cacheMeta: createCacheMeta({ key: 'cache:realms', cached: true })
        }))
      }
    })

    const res = await app.request('/meta/retail/realms?region=us&locale=en_US')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].slug).toBe('stormrage')
    expect(body.meta.region).toBe('us')
    expect(body.meta.locale).toBe('en_US')
    expect(body.meta.cached).toBe(true)
    expect(body.meta.cache.key).toBe('cache:realms')
  })

  it('wraps realm service failures via handleError', async () => {
    const app = new OpenAPIHono()
    registerMetaRoutes(app, {
      realmService: {
        listRealms: mock(async () => {
          throw new Error('realm failure')
        })
      }
    })

    const res = await app.request('/meta/retail/realms?region=us&locale=en_US')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server:unexpected')
  })
})
