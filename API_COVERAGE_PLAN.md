# Comprehensive Plan: Full Battle.net API Coverage with Enhanced UX

## Executive Summary

This document outlines a comprehensive plan to achieve full Battle.net World of Warcraft API coverage with significantly improved developer experience (DX) and user experience (UX). The plan builds incrementally on the existing `/v1` API foundation.

## Current State Analysis

### What We Have Now ✅

- Character profile summaries (retail & classic variants)
- PvP bracket statistics (2v2, 3v3, RBG, Solo Shuffle)
- Honor levels and honorable kills
- Realm listings
- Token caching and error handling
- Multi-game support (retail, classic-era, classic-wotlk, classic-hc)
- OpenAPI/Swagger documentation
- Clean, flattened response structures
- Field filtering support
- Unified error handling

### What's Missing

**Character Profile Data:**
- Guild membership and roster
- Achievements
- Equipment/items (current gear)
- Mythic+ runs and rankings
- Raid progression
- Mounts, pets, toys collections
- Professions
- Reputations
- Quests
- Talents/specializations details
- Character statistics
- Character media (avatars, renders)

**Leaderboard Data:**
- PvP leaderboards
- Mythic+ leaderboards
- Raid progression leaderboards

**Guild Data:**
- Guild profiles
- Guild rosters
- Guild achievements

**Game Data (Reference):**
- Spells
- Items
- Achievements definitions
- Mounts/pets/toys reference data
- Dungeons/raids reference data
- Classes/races/specs data

**Economy:**
- Auction house data
- WoW Token prices

## Battle.net API Categories Overview

### 1. Profile APIs (Character-specific data)

These APIs provide character-specific information:

- Character profile
- Character achievements
- Character appearance
- Character collections (mounts, pets, toys, heirlooms)
- Character encounters (raids/dungeons)
- Character equipment
- Character hunter pets
- Character media (avatars, renders)
- Character mythic keystone profile
- Character professions
- Character PvP (✅ already implemented)
- Character quests
- Character reputations
- Character soulbinds
- Character specializations
- Character statistics
- Character titles

### 2. Game Data APIs (Static/dynamic game information)

These provide reference data about game objects:

- Achievement data
- Auction house
- Azerite essence
- Connected realm
- Covenant
- Creature
- Guild crest
- Item data
- Journal (encounters, instances)
- Media (icons, renders)
- Mythic Keystone Affix
- Mythic Keystone Dungeon
- Mythic Keystone Leaderboard
- Mythic Raid Leaderboard
- Mount data
- Mythic+ Season
- Pet data
- Playable class/race/spec
- Power type
- Profession data
- PvP Season
- PvP Tier
- Quest data
- Realm data
- Region data
- Reputation data
- Spell data
- Talent data
- Tech talent
- Title data
- Token (WoW Token price)

### 3. Community APIs

These provide guild and social data:

- Guild roster
- Guild achievements
- Guild rewards

## Proposed API Structure

### Phase 1: Enhanced Character Endpoints (High Priority)

**New Endpoints:**

```
GET /v1/{game}/characters/{realm}/{name}/equipment
GET /v1/{game}/characters/{realm}/{name}/mythic-plus
GET /v1/{game}/characters/{realm}/{name}/raids
GET /v1/{game}/characters/{realm}/{name}/achievements
GET /v1/{game}/characters/{realm}/{name}/collections
GET /v1/{game}/characters/{realm}/{name}/professions
GET /v1/{game}/characters/{realm}/{name}/reputations
GET /v1/{game}/characters/{realm}/{name}/media
GET /v1/{game}/characters/{realm}/{name}/full
```

**UX Improvements:**

1. **Aggregate Endpoint**: `GET /v1/{game}/characters/{realm}/{name}/full`
   - Combines profile + equipment + mythic+ + raids in one call
   - Reduces client-side API calls from 5+ to 1
   - Supports `?include=` parameter to choose which sections to include

2. **Smart Caching Strategy**:
   - Equipment/collections: 1 hour cache
   - PvP data: 15 minutes cache
   - Profile: 30 minutes cache
   - Include cache metadata in responses

3. **Computed Metrics**:
   - Overall item level with per-slot breakdowns
   - Mythic+ score with best runs per dungeon
   - Raid progression percentages (N/H/M)
   - Achievement points and recently earned
   - Collection completion percentages

4. **Field Filtering**: 
   - Continue the `?fields=` pattern
   - Example: `?fields=name,level,equipment.averageItemLevel`

5. **Embeds**: 
   - `?embed=equipment,mythic-plus` to include related data
   - Alternative to hitting multiple endpoints

**Example Response Structure:**

```json
{
  "data": {
    "profile": {
      "name": "Thiaba",
      "realm": "Area 52",
      "realmSlug": "area-52",
      "level": 80,
      "class": "Mage",
      "spec": "Fire",
      "faction": "Horde"
    },
    "equipment": {
      "averageItemLevel": 489,
      "equippedItemLevel": 487,
      "items": [
        {
          "slot": "head",
          "itemId": 12345,
          "name": "Crown of Eternal Winter",
          "ilvl": 489,
          "quality": "epic",
          "enchants": ["Enchant Helm - Burning Stats"],
          "gems": [76884]
        }
      ]
    },
    "mythicPlus": {
      "currentScore": 2845,
      "previousScore": 2721,
      "bestRuns": [
        {
          "dungeon": "The Stonevault",
          "level": 18,
          "time": 1847000,
          "score": 285.4,
          "affixes": ["Tyrannical", "Storming"],
          "completedAt": "2025-10-25T14:30:00Z"
        }
      ],
      "dungeonScores": {
        "the-stonevault": { "fortified": 280.1, "tyrannical": 285.4, "best": 285.4 },
        "the-dawnbreaker": { "fortified": 271.3, "tyrannical": 268.9, "best": 271.3 }
      }
    },
    "raids": {
      "current": {
        "name": "Nerub-ar Palace",
        "slug": "nerub-ar-palace",
        "progress": {
          "normal": { "completed": 8, "total": 8, "percentage": 100 },
          "heroic": { "completed": 7, "total": 8, "percentage": 87.5 },
          "mythic": { "completed": 3, "total": 8, "percentage": 37.5 }
        },
        "bosses": [
          {
            "name": "Ulgrax the Devourer",
            "normal": { "killed": true, "firstKill": "2025-09-10T20:15:00Z" },
            "heroic": { "killed": true, "firstKill": "2025-09-11T21:30:00Z" },
            "mythic": { "killed": true, "firstKill": "2025-09-15T22:45:00Z" }
          }
        ]
      }
    }
  },
  "meta": {
    "cached": true,
    "lastUpdate": "2025-10-27T10:30:00Z",
    "nextUpdate": "2025-10-27T11:00:00Z",
    "upstreamCalls": 5,
    "requestedSections": ["profile", "equipment", "mythicPlus", "raids"]
  }
}
```

### Phase 2: Leaderboards & Rankings (High Priority)

**New Endpoints:**

```
GET /v1/{game}/leaderboards/pvp/{bracket}
GET /v1/{game}/leaderboards/pvp/{bracket}/{realm}
GET /v1/{game}/leaderboards/mythic-plus
GET /v1/{game}/leaderboards/mythic-plus/dungeons/{dungeon}
GET /v1/{game}/leaderboards/raids/{raid}
```

**UX Improvements:**

1. **Pagination**: Proper cursor-based pagination
   - `?cursor=xxx&limit=50`
   - Include `nextCursor` and `previousCursor` in response

2. **Filtering**:
   - By realm: `?realm=area-52`
   - By class: `?class=mage`
   - By spec: `?spec=fire`
   - By region: `?region=us`
   - Combined: `?realm=area-52&class=mage&spec=fire`

3. **Combined Rankings**:
   - Show both regional and global rankings
   - Include percentile information

4. **Historical Data**:
   - Cache daily snapshots for trend analysis
   - `?historicalDate=2025-10-20` for past rankings

5. **Character Search**:
   - `GET /v1/{game}/leaderboards/pvp/{bracket}/search?character=thiaba`
   - Quickly find character position in leaderboards

**Example Response Structure:**

```json
{
  "data": {
    "leaderboard": "mythic-plus",
    "season": "season-1-tww",
    "region": "us",
    "entries": [
      {
        "rank": 1,
        "character": {
          "name": "Gingi",
          "realm": "Tarren Mill",
          "class": "Priest",
          "spec": "Shadow"
        },
        "score": 3842.5,
        "percentile": 99.99
      }
    ]
  },
  "meta": {
    "total": 156743,
    "page": {
      "limit": 50,
      "nextCursor": "xyz123",
      "previousCursor": null
    },
    "filters": {
      "region": "us",
      "class": null,
      "realm": null
    },
    "lastUpdate": "2025-10-27T10:00:00Z"
  }
}
```

### Phase 3: Guild Endpoints (Medium Priority)

**New Endpoints:**

```
GET /v1/{game}/guilds/{realm}/{name}
GET /v1/{game}/guilds/{realm}/{name}/roster
GET /v1/{game}/guilds/{realm}/{name}/achievements
GET /v1/{game}/guilds/{realm}/{name}/raids
GET /v1/{game}/guilds/{realm}/{name}/statistics
```

**UX Improvements:**

1. **Aggregate Roster Stats**:
   - Class distribution chart data
   - Average item level across roster
   - Average M+ score across roster
   - Activity metrics (last login distribution)

2. **Guild Progression**:
   - Unified raid/M+ progress view
   - Compare against realm/region averages

3. **Active Member Tracking**:
   - Last login timestamps
   - Activity trends

4. **Roster Changes** (if cached regularly):
   - Track joins/leaves
   - Rank changes

**Example Response Structure:**

```json
{
  "data": {
    "guild": {
      "name": "Method",
      "realm": "Tarren Mill",
      "faction": "Horde",
      "achievementPoints": 12450,
      "memberCount": 247
    },
    "roster": {
      "members": [
        {
          "character": {
            "name": "Gingi",
            "level": 80,
            "class": "Priest",
            "spec": "Shadow",
            "rank": "Guild Master"
          },
          "itemLevel": 489,
          "mythicPlusScore": 3842.5,
          "lastLogin": "2025-10-27T09:15:00Z"
        }
      ],
      "statistics": {
        "classCounts": {
          "death-knight": 23,
          "druid": 18,
          "hunter": 15
        },
        "averageItemLevel": 476.3,
        "averageMythicPlusScore": 2543.8,
        "activityRate": {
          "lastDay": 87,
          "lastWeek": 156,
          "lastMonth": 234
        }
      }
    },
    "progression": {
      "raids": {
        "nerub-ar-palace": {
          "mythic": { "completed": 8, "total": 8, "worldRank": 1 }
        }
      }
    }
  },
  "meta": {
    "cached": true,
    "lastUpdate": "2025-10-27T10:30:00Z"
  }
}
```

### Phase 4: Game Data & Reference (Medium Priority)

**New Endpoints:**

```
GET /v1/data/items/{id}
GET /v1/data/items/search
GET /v1/data/items/batch
GET /v1/data/spells/{id}
GET /v1/data/spells/search
GET /v1/data/achievements/{id}
GET /v1/data/achievements/search
GET /v1/data/mounts
GET /v1/data/pets
GET /v1/data/dungeons
GET /v1/data/raids
GET /v1/data/classes
GET /v1/data/races
GET /v1/data/specs
```

**UX Improvements:**

1. **Heavy Caching**:
   - 24 hour cache for static data
   - Pre-warm cache for popular items

2. **Batch Endpoints**:
   - `GET /v1/data/items/batch?ids=1,2,3,4,5`
   - Fetch multiple items in one request

3. **Search/Autocomplete**:
   - `GET /v1/data/items/search?q=sword&limit=10`
   - Fast fuzzy search for items, spells, achievements

4. **Include Media URLs**:
   - Always include icon URLs
   - Include high-res renders where available

5. **Full Localization**:
   - Support all locales with fallbacks
   - Return multiple locales if requested

**Example Response Structure:**

```json
{
  "data": {
    "item": {
      "id": 219915,
      "name": "Void Reaper's Contract",
      "quality": "epic",
      "level": 489,
      "requiredLevel": 80,
      "itemClass": "weapon",
      "itemSubclass": "dagger",
      "inventoryType": "main_hand",
      "stats": [
        { "type": "agility", "value": 823 },
        { "type": "stamina", "value": 1647 }
      ],
      "media": {
        "icon": "https://render.worldofwarcraft.com/us/icons/56/inv_knife_1h_drakthyr_c_01_purple.jpg",
        "iconLarge": "https://render.worldofwarcraft.com/us/icons/256/inv_knife_1h_drakthyr_c_01_purple.jpg"
      },
      "source": {
        "type": "drop",
        "encounters": ["Ulgrax the Devourer"]
      }
    }
  },
  "meta": {
    "locale": "en_US",
    "cached": true,
    "cacheExpires": "2025-10-28T10:30:00Z"
  }
}
```

### Phase 5: Economy & Marketplace (Medium Priority)

**New Endpoints:**

```
GET /v1/{game}/auction-houses/{realm}
GET /v1/{game}/auction-houses/{realm}/items/{itemId}
GET /v1/{game}/token-price
GET /v1/{game}/commodities
GET /v1/{game}/commodities/{itemId}/history
```

**UX Improvements:**

1. **Price Aggregation**:
   - Min/max/avg/median prices
   - Price per stack vs per item

2. **Historical Tracking**:
   - Price trends over time (7d, 30d, 90d)
   - Volume trends

3. **Snapshot Caching**:
   - Update every 15-30 minutes
   - Include snapshot timestamp

4. **Item Lookup**:
   - Search by item name/ID
   - Filter by quality, category

**Example Response Structure:**

```json
{
  "data": {
    "realm": "area-52",
    "connectedRealmId": 3678,
    "item": {
      "id": 190456,
      "name": "Artisan Curios",
      "quantity": 12453
    },
    "prices": {
      "current": {
        "min": 850000,
        "max": 1200000,
        "average": 975000,
        "median": 950000
      },
      "perItem": {
        "min": 85000,
        "max": 120000,
        "average": 97500,
        "median": 95000
      }
    },
    "history": {
      "7day": {
        "average": 982000,
        "trend": "stable"
      },
      "30day": {
        "average": 1050000,
        "trend": "decreasing"
      }
    },
    "volume": {
      "total": 12453,
      "auctions": 247
    }
  },
  "meta": {
    "snapshotTime": "2025-10-27T10:30:00Z",
    "nextUpdate": "2025-10-27T11:00:00Z"
  }
}
```

### Phase 6: Advanced Features (Lower Priority)

**New Endpoints:**

```
GET /v1/{game}/characters/{realm}/{name}/compare/{realm2}/{name2}
GET /v1/{game}/realms/{realm}/statistics
GET /v1/{game}/trends/pvp
GET /v1/{game}/trends/mythic-plus
GET /v1/{game}/trends/classes
GET /v1/search/characters
GET /v1/search/guilds
POST /v1/batch
```

**UX Improvements:**

1. **Character Comparison**:
   - Side-by-side stats for 2+ characters
   - Highlight differences
   - Show who's ahead in each category

2. **Server Statistics**:
   - Population estimates
   - Faction balance
   - Progression metrics (avg ilvl, M+ scores)

3. **Trend Analysis**:
   - Rising stars in PvP/M+
   - Class popularity trends
   - Spec representation

4. **Global Search**:
   - Find characters across realms
   - Search by name, class, spec, min-ilvl, etc.
   - Fuzzy matching

5. **Batch Requests**:
   - Make multiple API calls in one HTTP request
   - Reduces round-trips for complex UIs

**Example Batch Request:**

```json
POST /v1/batch

{
  "requests": [
    {
      "id": "char1",
      "method": "GET",
      "path": "/v1/retail/characters/area-52/thiaba"
    },
    {
      "id": "char2",
      "method": "GET",
      "path": "/v1/retail/characters/area-52/bob"
    },
    {
      "id": "realms",
      "method": "GET",
      "path": "/v1/retail/realms?region=us"
    }
  ]
}

Response:
{
  "responses": [
    {
      "id": "char1",
      "status": 200,
      "data": { ... }
    },
    {
      "id": "char2",
      "status": 404,
      "error": { ... }
    },
    {
      "id": "realms",
      "status": 200,
      "data": { ... }
    }
  ]
}
```

## Key UX/DX Enhancements

### 1. Smart Aggregation

**Problem**: Developers need to make 5-10 API calls to build a character page

**Solution**: Aggregate endpoints that combine multiple Battle.net calls

**Example**:
```
GET /v1/retail/characters/area-52/thiaba/full?include=profile,equipment,mythic-plus,raids,pvp
```

Single call returns everything needed for a character page.

### 2. Computed Metrics

**Problem**: Battle.net returns raw data; developers must compute common metrics

**Solution**: Pre-compute commonly needed metrics

**Examples**:
- Win rates (already doing ✅)
- Mythic+ score calculations
- Raid progression percentages
- Achievement completion rates
- Collection completion percentages
- Upgrade recommendations (which slots need ilvl boost)

### 3. Intelligent Caching Strategy

```typescript
const CACHE_DURATIONS = {
  // Static data - rarely changes
  gameData: 24 * 60 * 60 * 1000, // 24 hours
  items: 24 * 60 * 60 * 1000,
  spells: 24 * 60 * 60 * 1000,
  achievements: 24 * 60 * 60 * 1000,
  
  // Semi-static - changes weekly/daily
  realms: 60 * 60 * 1000, // 1 hour
  
  // Character data - updates on logout
  profile: 30 * 60 * 1000, // 30 minutes
  equipment: 60 * 60 * 1000, // 1 hour
  collections: 60 * 60 * 1000, // 1 hour
  professions: 60 * 60 * 1000, // 1 hour
  
  // Competitive data - needs freshness
  pvp: 15 * 60 * 1000, // 15 minutes
  mythicPlus: 15 * 60 * 1000, // 15 minutes
  leaderboards: 15 * 60 * 1000, // 15 minutes
  
  // Economic data - moderate freshness
  auctionHouse: 30 * 60 * 1000, // 30 minutes
  tokenPrice: 60 * 60 * 1000, // 1 hour
  
  // Guild data
  guildRoster: 30 * 60 * 1000, // 30 minutes
  guildAchievements: 60 * 60 * 1000 // 1 hour
}
```

**Cache Metadata**: Always include in responses:
```json
{
  "meta": {
    "cached": true,
    "cacheAge": 450,
    "cacheExpires": "2025-10-27T11:00:00Z",
    "lastFetch": "2025-10-27T10:30:00Z"
  }
}
```

### 4. Response Flattening

**Problem**: Battle.net APIs are deeply nested and verbose

**Solution**: Continue the pattern of flattening responses

**Battle.net Returns**:
```json
{
  "character": {
    "name": "Thiaba",
    "realm": {
      "key": {
        "href": "https://us.api.blizzard.com/data/wow/realm/3678?namespace=dynamic-us"
      },
      "name": "Area 52",
      "id": 3678,
      "slug": "area-52"
    }
  },
  "equipped_items": [
    {
      "item": {
        "key": { "href": "..." },
        "id": 12345
      },
      "slot": {
        "type": "HEAD",
        "name": "Head"
      },
      "quality": {
        "type": "EPIC",
        "name": "Epic"
      },
      "level": { "value": 489 }
    }
  ]
}
```

**Your API Returns**:
```json
{
  "character": {
    "name": "Thiaba",
    "realm": "Area 52",
    "realmSlug": "area-52"
  },
  "equipment": [
    {
      "slot": "head",
      "itemId": 12345,
      "name": "Crown of Eternal Winter",
      "ilvl": 489,
      "quality": "epic"
    }
  ]
}
```

### 5. Batch Endpoints

**Problem**: Need to fetch many resources, causing multiple round-trips

**Solution**: Batch endpoint that accepts multiple requests

```
POST /v1/batch
{
  "requests": [
    { "id": "req1", "method": "GET", "path": "/v1/retail/characters/area-52/thiaba" },
    { "id": "req2", "method": "GET", "path": "/v1/retail/characters/area-52/bob" }
  ]
}
```

Benefits:
- Reduces HTTP overhead
- Better performance for complex UIs
- Single authentication check

### 6. Webhooks/Change Detection

**Problem**: Clients poll for updates, wasting requests

**Solution**: Conditional requests with `If-Modified-Since`

```
GET /v1/retail/characters/area-52/thiaba
If-Modified-Since: 2025-10-27T10:00:00Z

Response: 304 Not Modified (if no changes)
```

**Future Enhancement**: WebSocket subscriptions for real-time updates

### 7. GraphQL-style Field Selection

**Current**: Comma-separated fields
```
?fields=name,level,equipment
```

**Enhanced**: Nested field selection
```
?select={name,level,equipment{slot,ilvl},mythicPlus{currentScore}}
```

Allows clients to request exactly what they need.

### 8. Embeds for Related Resources

**Problem**: Need related data, requires multiple calls

**Solution**: `?embed` parameter

```
GET /v1/retail/characters/area-52/thiaba?embed=equipment,guild,mythic-plus
```

Returns character + embedded resources in one response.

## Implementation Priority Matrix

| Feature | User Value | Implementation Effort | Priority | Est. Hours |
|---------|-----------|----------------------|----------|------------|
| Equipment endpoint | High | Low | **P0** | 2-3 |
| Mythic+ endpoint | High | Medium | **P0** | 3-4 |
| Raid progression | High | Medium | **P0** | 3-4 |
| Character media | Low | Low | **P0** | 1-2 |
| Aggregate `/full` endpoint | Very High | Medium | **P0** | 2-3 |
| PvP leaderboards | High | Medium | **P0** | 4-5 |
| M+ leaderboards | High | Medium | **P0** | 4-5 |
| LRU cache layer | High | Medium | **P0** | 2-3 |
| Guild roster | Medium | Medium | **P1** | 3-4 |
| Guild statistics | Medium | Low | **P1** | 2-3 |
| Achievements | Medium | Medium | **P1** | 3-4 |
| Collections | Medium | Low | **P1** | 2-3 |
| Professions | Low | Low | **P1** | 2-3 |
| Reputations | Low | Low | **P1** | 2-3 |
| Item reference API | Medium | Medium | **P2** | 3-4 |
| Spell reference API | Medium | Medium | **P2** | 3-4 |
| Search endpoints | Medium | High | **P2** | 6-8 |
| Auction house | Low | High | **P2** | 6-8 |
| Batch endpoint | Low | Medium | **P2** | 3-4 |
| Character comparison | Low | Medium | **P3** | 3-4 |
| Trend analysis | Low | High | **P3** | 8-10 |
| WebSocket support | Low | High | **P3** | 10-12 |

### Quick Wins (P0 - Do First)

These provide maximum value for minimal effort:

1. **Equipment endpoint** - 2-3 hours
2. **Character media** - 1-2 hours
3. **Mythic+ endpoint** - 3-4 hours
4. **Raid progression** - 3-4 hours
5. **Simple LRU cache** - 2-3 hours
6. **Character aggregate `/full`** - 2-3 hours
7. **PvP leaderboards** - 4-5 hours
8. **M+ leaderboards** - 4-5 hours

**Total quick wins: ~25 hours of work for 80% of value**

## Caching Architecture

### Current State
✅ In-memory token cache with TTL

### Recommended Approach

**Phase 1: LRU In-Memory Cache** (Easiest, do first)

```typescript
import { LRUCache } from 'lru-cache'

const cache = new LRUCache({
  max: 500, // max items
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (value) => JSON.stringify(value).length,
  ttl: 1000 * 60 * 15, // 15 min default
  ttlAutopurge: true,
  updateAgeOnGet: true
})
```

Benefits:
- No external dependencies
- Fast
- Good for single-instance deployments

**Phase 2: File-based Cache** (Optional, for persistence)

```typescript
// Cache responses to disk
const cache = new FileCache('./cache', {
  ttl: CACHE_DURATIONS
})
```

Benefits:
- Survives restarts
- Can inspect cache contents
- Good for development

**Phase 3: Redis Cache** (Production, for scale)

```typescript
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// Cache with automatic serialization
await redis.setex(
  `character:retail:us:area-52:thiaba`,
  1800, // 30 min
  JSON.stringify(data)
)
```

Benefits:
- Distributed caching
- Shared across multiple instances
- Battle-tested at scale
- Built-in TTL support

### Cache Key Strategy

```typescript
function buildCacheKey(parts: string[]): string {
  return parts
    .map(p => p.toLowerCase().replace(/[^a-z0-9]/g, '-'))
    .join(':')
}

// Examples:
// character:retail:us:area-52:thiaba:profile
// character:retail:us:area-52:thiaba:equipment
// leaderboard:pvp:retail:us:2v2:page:1
// guild:retail:us:area-52:method:roster
// item:219915
```

### Cache Invalidation

**Strategy 1: Time-based** (Simple, recommended)
- Set appropriate TTLs based on data volatility
- Let cache expire naturally

**Strategy 2: Event-based** (Advanced)
- Invalidate when Battle.net sends update notifications
- Requires webhook support (Battle.net doesn't provide this)

**Strategy 3: Lazy invalidation** (Hybrid)
- Store with TTL
- If request fails or returns stale data, purge cache
- Fallback to cached data if Battle.net is down

### Cache Headers

Return cache information in responses:

```json
{
  "meta": {
    "cache": {
      "hit": true,
      "age": 450,
      "expires": "2025-10-27T11:00:00Z",
      "key": "character:retail:us:area-52:thiaba"
    }
  }
}
```

## Error Handling Improvements

### Current State
✅ Structured ApiError class
✅ Proper HTTP status codes
✅ Error details in responses

### Enhancements

**1. Retry Logic**

```typescript
async function fetchWithRetry(
  fn: () => Promise<any>,
  maxRetries = 3,
  delay = 1000
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.status < 500 || i === maxRetries - 1) {
        throw error
      }
      await sleep(delay * Math.pow(2, i)) // Exponential backoff
    }
  }
}
```

**2. Circuit Breaker**

```typescript
class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  
  async execute(fn: () => Promise<any>) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > 60000) {
        this.state = 'half-open'
      } else {
        throw new Error('Circuit breaker is open')
      }
    }
    
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess() {
    this.failures = 0
    this.state = 'closed'
  }
  
  private onFailure() {
    this.failures++
    this.lastFailureTime = Date.now()
    if (this.failures >= 5) {
      this.state = 'open'
    }
  }
}
```

**3. Fallback to Stale Cache**

```typescript
async function fetchWithCacheFallback(key: string, fetcher: () => Promise<any>) {
  try {
    const data = await fetcher()
    await cache.set(key, data, { ttl: 1800 })
    return data
  } catch (error) {
    // Try to return stale cache
    const stale = await cache.get(key, { allowStale: true })
    if (stale) {
      console.warn('Returning stale cache due to error:', error)
      return { ...stale, _stale: true }
    }
    throw error
  }
}
```

**4. Partial Success**

```typescript
// If fetching multiple resources, return what succeeded
async function fetchCharacterFull(realm: string, name: string) {
  const [profile, equipment, mythicPlus, raids] = await Promise.allSettled([
    fetchProfile(realm, name),
    fetchEquipment(realm, name),
    fetchMythicPlus(realm, name),
    fetchRaids(realm, name)
  ])
  
  return {
    profile: profile.status === 'fulfilled' ? profile.value : null,
    equipment: equipment.status === 'fulfilled' ? equipment.value : null,
    mythicPlus: mythicPlus.status === 'fulfilled' ? mythicPlus.value : null,
    raids: raids.status === 'fulfilled' ? raids.value : null,
    errors: [
      profile.status === 'rejected' && profile.reason,
      equipment.status === 'rejected' && equipment.reason,
      mythicPlus.status === 'rejected' && mythicPlus.reason,
      raids.status === 'rejected' && raids.reason
    ].filter(Boolean)
  }
}
```

## Rate Limiting Strategy

**Battle.net Limits**: 100 requests/second per IP

**Strategies to stay under limit**:

**1. Request Coalescing**
```typescript
// If 2 users request same data simultaneously, make only 1 upstream call
const pendingRequests = new Map<string, Promise<any>>()

async function fetchWithCoalescing(key: string, fetcher: () => Promise<any>) {
  const existing = pendingRequests.get(key)
  if (existing) {
    return existing
  }
  
  const promise = fetcher().finally(() => {
    pendingRequests.delete(key)
  })
  
  pendingRequests.set(key, promise)
  return promise
}
```

**2. Request Queuing**
```typescript
import PQueue from 'p-queue'

const queue = new PQueue({
  concurrency: 50, // Max 50 concurrent requests
  interval: 1000, // Per second
  intervalCap: 90 // 90 requests per second (safety margin)
})

async function queuedFetch(url: string) {
  return queue.add(() => fetch(url))
}
```

**3. Cache Warming**
```typescript
// Pre-fetch popular characters/leaderboards
async function warmCache() {
  const popular = await getPopularCharacters() // From DB/analytics
  
  for (const char of popular) {
    await fetchCharacter(char.realm, char.name)
  }
}

// Run every hour
setInterval(warmCache, 60 * 60 * 1000)
```

**4. Request Priority**
```typescript
enum Priority {
  HIGH = 1,    // User-facing requests
  MEDIUM = 5,  // Background updates
  LOW = 10     // Cache warming
}

const priorityQueue = new PQueue({
  concurrency: 50
})

async function fetchWithPriority(url: string, priority: Priority) {
  return priorityQueue.add(() => fetch(url), { priority })
}
```

## Documentation Enhancements

### Current State
✅ OpenAPI/Swagger UI
✅ Route-level documentation

### Enhancements

**1. Rich Examples**

Add real response examples to every endpoint in OpenAPI spec:

```typescript
{
  examples: {
    'success': {
      summary: 'Successful character lookup',
      value: {
        data: {
          name: 'Thiaba',
          realm: 'Area 52',
          level: 80,
          // ... full example
        }
      }
    },
    'not-found': {
      summary: 'Character not found',
      value: {
        error: {
          code: 'character:not_found',
          message: 'Character not found'
        }
      }
    }
  }
}
```

**2. Interactive Tutorials**

Create `/docs` page with tutorials:
- "Building a Character Profile Page"
- "Creating a Guild Roster"
- "Implementing PvP Leaderboards"
- "Real-time Auction House Tracking"

**3. Code Examples**

Provide copy-paste examples in multiple languages:

```markdown
## Get Character Profile

### JavaScript/TypeScript
```js
const response = await fetch('https://api.example.com/v1/retail/characters/area-52/thiaba')
const data = await response.json()
console.log(data.data.name)
```

### Python
```python
import requests
response = requests.get('https://api.example.com/v1/retail/characters/area-52/thiaba')
data = response.json()
print(data['data']['name'])
```

### cURL
```bash
curl https://api.example.com/v1/retail/characters/area-52/thiaba
```
```

**4. Postman Collection**

Export OpenAPI spec to Postman collection:

```bash
# Generate Postman collection from OpenAPI
openapi2postmanv2 -s openapi.json -o postman-collection.json
```

**5. Rate Limit Documentation**

Document caching strategy and rate limits:

```markdown
## Caching & Rate Limits

All endpoints are cached with varying TTLs based on data volatility:

| Endpoint Type | Cache Duration | Update Frequency |
|--------------|----------------|------------------|
| Character Profile | 30 minutes | On logout |
| PvP Data | 15 minutes | Real-time |
| Leaderboards | 15 minutes | Every reset |
| Game Data | 24 hours | Rarely |

Include `Cache-Control` headers in your requests to control caching.
```

**6. Changelog**

Maintain API changelog:

```markdown
## Changelog

### v1.2.0 - 2025-11-01
**Added**
- Mythic+ endpoint
- Raid progression endpoint
- Equipment endpoint

**Changed**
- PvP endpoint now includes solo shuffle by default

**Deprecated**
- None

**Removed**
- None

**Fixed**
- Win rate calculation for 0 games played
```

## Testing Strategy

### Current State
✅ Basic test scripts
✅ Manual testing against Battle.net

### Comprehensive Testing

**1. Unit Tests**

```typescript
// tests/services/character-service.test.ts
import { describe, it, expect } from 'bun:test'
import { createCharacterService } from '../src/v1/services/character-service'

describe('CharacterService', () => {
  it('flattens character profile correctly', async () => {
    const mockClient = createMockBattleNetClient({
      '/profile/wow/character/area-52/thiaba': {
        name: 'Thiaba',
        realm: { name: 'Area 52', slug: 'area-52' },
        level: 80
      }
    })
    
    const service = createCharacterService(mockClient)
    const result = await service.getCharacterSummary(
      'retail', 'us', 'area-52', 'thiaba', 'en_US'
    )
    
    expect(result).toEqual({
      name: 'Thiaba',
      realm: 'Area 52',
      realmSlug: 'area-52',
      level: 80
    })
  })
  
  it('computes win rates correctly', () => {
    expect(computeWinRate(10, 5)).toBe(66.7)
    expect(computeWinRate(0, 0)).toBe(null)
    expect(computeWinRate(5, 5)).toBe(50)
  })
})
```

**2. Integration Tests**

```typescript
// tests/integration/character-routes.test.ts
import { describe, it, expect, beforeAll } from 'bun:test'
import app from '../src/index'

describe('Character Routes Integration', () => {
  beforeAll(async () => {
    // Setup test environment
  })
  
  it('returns character data from real Battle.net API', async () => {
    const res = await app.request('/v1/retail/characters/area-52/thiaba?region=us')
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data.name).toBe('Thiaba')
    expect(data.meta.cached).toBeDefined()
  })
  
  it('handles non-existent characters', async () => {
    const res = await app.request('/v1/retail/characters/area-52/nonexistent')
    
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error.code).toBe('bnet:not_found')
  })
})
```

**3. Contract Tests**

```typescript
// tests/contracts/battlenet-api.test.ts
import { describe, it, expect } from 'bun:test'

describe('Battle.net API Contract', () => {
  it('character profile schema matches expectations', async () => {
    const response = await fetchRealBattleNetAPI('/profile/wow/character/area-52/thiaba')
    
    // Ensure Battle.net hasn't changed their schema
    expect(response).toMatchSchema({
      name: expect.any(String),
      realm: {
        name: expect.any(String),
        slug: expect.any(String)
      },
      level: expect.any(Number)
    })
  })
})
```

**4. Load Tests**

```typescript
// tests/load/character-endpoint.test.ts
import autocannon from 'autocannon'

async function runLoadTest() {
  const result = await autocannon({
    url: 'http://localhost:3000/v1/retail/characters/area-52/thiaba',
    connections: 100,
    duration: 30,
    pipelining: 1
  })
  
  console.log(result)
  
  // Assertions
  expect(result.errors).toBe(0)
  expect(result.non2xx).toBe(0)
  expect(result.requests.average).toBeGreaterThan(1000) // >1000 req/s
}
```

**5. Mock Server for Development**

```typescript
// tests/mocks/battlenet-mock-server.ts
import { Hono } from 'hono'

const mockServer = new Hono()

mockServer.get('/profile/wow/character/:realm/:name', (c) => {
  const { realm, name } = c.req.param()
  
  return c.json({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    realm: { name: realm, slug: realm },
    level: 80,
    character_class: { name: 'Mage' }
  })
})

// Use for development without Battle.net credentials
export default mockServer
```

## Monitoring & Observability

### Metrics to Track

**1. API Metrics**
- Request rate (req/s)
- Response time (p50, p95, p99)
- Error rate by endpoint
- Error rate by status code (4xx, 5xx)
- Cache hit rate
- Cache size/memory usage

**2. Battle.net Metrics**
- Upstream request rate
- Upstream error rate
- Upstream response times
- Token refresh frequency

**3. Business Metrics**
- Most requested characters
- Most requested realms
- Popular endpoints
- User agent distribution

### Implementation

**1. Basic Metrics Middleware**

```typescript
import { Hono } from 'hono'

const metricsMiddleware = async (c, next) => {
  const start = Date.now()
  const path = c.req.path
  
  await next()
  
  const duration = Date.now() - start
  const status = c.res.status
  
  // Log metrics
  console.log(JSON.stringify({
    type: 'request',
    method: c.req.method,
    path,
    status,
    duration,
    cached: c.res.headers.get('x-cache-hit'),
    timestamp: new Date().toISOString()
  }))
}

app.use('*', metricsMiddleware)
```

**2. Structured Logging**

```typescript
interface LogContext {
  requestId: string
  method: string
  path: string
  status?: number
  duration?: number
  error?: any
}

function log(level: 'info' | 'warn' | 'error', message: string, context: LogContext) {
  console.log(JSON.stringify({
    level,
    message,
    ...context,
    timestamp: new Date().toISOString()
  }))
}

// Usage
log('info', 'Character fetched successfully', {
  requestId: 'abc123',
  method: 'GET',
  path: '/v1/retail/characters/area-52/thiaba',
  status: 200,
  duration: 234
})
```

**3. Health Check Endpoint**

```typescript
app.get('/v1/health', async (c) => {
  const checks = await Promise.allSettled([
    checkBattleNetAPI(),
    checkCacheHealth(),
    checkMemoryUsage()
  ])
  
  const healthy = checks.every(c => c.status === 'fulfilled')
  
  return c.json({
    status: healthy ? 'healthy' : 'degraded',
    checks: {
      battlenet: checks[0].status === 'fulfilled',
      cache: checks[1].status === 'fulfilled',
      memory: checks[2].status === 'fulfilled'
    },
    uptime: process.uptime(),
    version: '1.0.0'
  }, healthy ? 200 : 503)
})
```

**4. Analytics Tracking**

```typescript
// Track popular characters for cache warming
class PopularityTracker {
  private counts = new Map<string, number>()
  
  track(game: string, realm: string, character: string) {
    const key = `${game}:${realm}:${character}`
    this.counts.set(key, (this.counts.get(key) || 0) + 1)
  }
  
  getTop(limit = 100) {
    return Array.from(this.counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => {
        const [game, realm, character] = key.split(':')
        return { game, realm, character, requests: count }
      })
  }
}
```

## Migration Path

### Option 1: Incremental Updates to /v1 (Recommended)

**Pros**:
- No breaking changes
- Gradual rollout
- Single version to maintain

**Cons**:
- Must maintain backward compatibility

**Approach**:
```
Phase 1: Add new endpoints to /v1
  - /v1/retail/characters/{realm}/{name}/equipment
  - /v1/retail/characters/{realm}/{name}/mythic-plus
  - etc.

Phase 2: Add aggregate endpoints
  - /v1/retail/characters/{realm}/{name}/full

Phase 3: Add leaderboards
  - /v1/retail/leaderboards/pvp/{bracket}

Phase 4: Add game data
  - /v1/data/items/{id}
```

### Option 2: Create /v2 (Future)

Only if breaking changes are needed:

**When to use**:
- Need to change response structure significantly
- Want to remove deprecated fields
- Major architectural changes

**Approach**:
```
- Keep /v1 running
- Launch /v2 with new structure
- Deprecate /v1 with 6-month notice
- Sunset /v1 after migration period
```

## Example Implementation: Equipment Endpoint

To demonstrate the full pattern, here's what a complete equipment endpoint would look like:

### Service Layer

```typescript
// src/v1/services/equipment-service.ts
import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'

export interface EquipmentItem {
  slot: string
  itemId: number
  name: string
  quality: string
  level: number
  enchantments: string[]
  gems: number[]
  bonus?: string
}

export interface EquipmentSummary {
  averageItemLevel: number | null
  equippedItemLevel: number | null
  items: EquipmentItem[]
}

export interface EquipmentService {
  getEquipment(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string
  ): Promise<EquipmentSummary>
}

export function createEquipmentService(client: BattleNetClient): EquipmentService {
  return {
    async getEquipment(game, region, realmSlug, name, locale) {
      const config = getGameConfig(game)
      if (!config.supportsProfiles) {
        throw new ApiError({
          status: 501,
          code: 'game:not_yet_supported',
          message: `Equipment data not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.profile(region)
      const characterPath = config.characterPath(realmSlug, name)

      try {
        const data = await client.fetchJson<EquipmentResponse>(
          `${characterPath}/equipment`,
          { region, locale, namespace }
        )

        return {
          averageItemLevel: data.average_item_level ?? null,
          equippedItemLevel: data.equipped_item_level ?? null,
          items: (data.equipped_items || []).map(item => ({
            slot: normalizeSlot(item.slot.type),
            itemId: item.item.id,
            name: item.name || 'Unknown Item',
            quality: item.quality.type.toLowerCase(),
            level: item.level?.value ?? 0,
            enchantments: (item.enchantments || [])
              .map(e => e.display_string)
              .filter(Boolean),
            gems: (item.sockets || [])
              .map(s => s.item?.id)
              .filter(Boolean) as number[],
            bonus: item.bonus_list?.length ? `Bonus IDs: ${item.bonus_list.join(',')}` : undefined
          }))
        }
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'character:equipment_failed',
          message: 'Unable to load character equipment from Battle.net API',
          details: { game, region, realmSlug, name },
          cause: error
        })
      }
    }
  }
}

function normalizeSlot(slot: string): string {
  const map: Record<string, string> = {
    'HEAD': 'head',
    'NECK': 'neck',
    'SHOULDER': 'shoulder',
    'BACK': 'back',
    'CHEST': 'chest',
    'WRIST': 'wrist',
    'HANDS': 'hands',
    'WAIST': 'waist',
    'LEGS': 'legs',
    'FEET': 'feet',
    'FINGER_1': 'finger1',
    'FINGER_2': 'finger2',
    'TRINKET_1': 'trinket1',
    'TRINKET_2': 'trinket2',
    'MAIN_HAND': 'mainHand',
    'OFF_HAND': 'offHand'
  }
  return map[slot] || slot.toLowerCase()
}

interface EquipmentResponse {
  average_item_level?: number
  equipped_item_level?: number
  equipped_items: Array<{
    slot: { type: string }
    item: { id: number }
    name?: string
    quality: { type: string }
    level?: { value: number }
    enchantments?: Array<{ display_string: string }>
    sockets?: Array<{ item?: { id: number } }>
    bonus_list?: number[]
  }>
}
```

### Route Layer

```typescript
// src/v1/routes/equipment.ts
import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { SUPPORTED_GAMES, SUPPORTED_REGIONS } from '../types'
import { EquipmentService } from '../services/equipment-service'
import { ok, handleError } from '../utils/http'

const EquipmentItemSchema = z.object({
  slot: z.string(),
  itemId: z.number(),
  name: z.string(),
  quality: z.string(),
  level: z.number(),
  enchantments: z.array(z.string()),
  gems: z.array(z.number()),
  bonus: z.string().optional()
})

const EquipmentResponseSchema = z.object({
  data: z.object({
    averageItemLevel: z.number().nullable(),
    equippedItemLevel: z.number().nullable(),
    items: z.array(EquipmentItemSchema)
  }),
  meta: z.object({
    cached: z.boolean(),
    region: z.enum(SUPPORTED_REGIONS)
  })
})

const equipmentRoute = createRoute({
  method: 'get',
  path: '/{gameId}/characters/{realmSlug}/{characterName}/equipment',
  tags: ['characters'],
  summary: 'Get character equipment',
  description: 'Returns equipped items with item level, enchants, and gems',
  request: {
    params: z.object({
      gameId: z.enum(SUPPORTED_GAMES),
      realmSlug: z.string(),
      characterName: z.string()
    }),
    query: z.object({
      region: z.enum(SUPPORTED_REGIONS).default('us'),
      locale: z.string().default('en_US')
    })
  },
  responses: {
    200: {
      description: 'Character equipment',
      content: {
        'application/json': {
          schema: EquipmentResponseSchema
        }
      }
    },
    404: {
      description: 'Character not found'
    },
    500: {
      description: 'Server error'
    }
  }
})

export interface EquipmentRouteDeps {
  equipmentService: EquipmentService
}

export function registerEquipmentRoutes(
  app: OpenAPIHono,
  deps: EquipmentRouteDeps
) {
  app.openapi(equipmentRoute, async (c) => {
    try {
      const { gameId, realmSlug, characterName } = c.req.valid('param')
      const { region, locale } = c.req.valid('query')

      const equipment = await deps.equipmentService.getEquipment(
        gameId,
        region,
        realmSlug,
        characterName,
        locale
      )

      return ok(c, {
        data: equipment,
        meta: {
          cached: false, // TODO: integrate with cache layer
          region
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })
}
```

### Integration

```typescript
// src/v1/index.ts
import { createEquipmentService } from './services/equipment-service'
import { registerEquipmentRoutes } from './routes/equipment'

export function createV1App() {
  const app = new OpenAPIHono()
  
  const battleNetClient = createBattleNetClient()
  const equipmentService = createEquipmentService(battleNetClient)
  
  // ... other services
  
  registerEquipmentRoutes(app, { equipmentService })
  
  return app
}
```

## Timeline Estimate

### Phase 0: Foundation (Week 1) - 8 hours
- [x] Set up LRU cache layer (in-memory + SQLite-backed with TTL metadata)
- [x] Add cache middleware/helpers across character/realm services
- [x] Update error handling with retries
- [x] Add metrics middleware (SQLite-backed counters)

### Phase 1: Core Character Data (Week 2-3) - 25 hours
- [x] Equipment endpoint
- [x] Character media endpoint
- [x] Mythic+ endpoint
- [x] Raid progression endpoint
- [x] Character aggregate `/full` endpoint
- [x] Character PvP caching integration
- [x] Realm list caching integration
- [x] Cache inspection diagnostics (`/cache` endpoints)

### Phase 2: Leaderboards (Week 4) - 10 hours
- [x] PvP leaderboards
- [x] M+ leaderboards
- [x] Pagination support

**Highlights**
- Implemented `/v1/{game}/leaderboards/pvp/{bracket}` with cursor pagination, bracket filters covering all Solo Shuffle class/spec variants, and rich metadata (season context, filter echo, cache info).
- Added `/v1/{game}/leaderboards/mythic-plus` supporting class, spec, dungeon, role, and faction filters with regional pagination and class leaderboard coverage.
- Shared pagination utility with offset cursors (`offset:n`) and consistent cache TTL via `leaderboards` bucket.

### Phase 3: Guild Features (Week 5) - 8 hours
- [ ] Guild roster endpoint
- [ ] Guild statistics
- [ ] Guild achievements

### Phase 4: Collections & Progression (Week 6) - 8 hours
- [ ] Achievements endpoint
- [ ] Collections endpoint
- [ ] Professions endpoint
- [ ] Reputations endpoint

### Phase 5: Game Data (Week 7-8) - 15 hours
- [ ] Item reference API
- [ ] Spell reference API
- [ ] Search functionality
- [ ] Batch endpoints

### Phase 6: Polish & Documentation (Week 9) - 10 hours
- [ ] Complete OpenAPI examples
- [ ] Write tutorials
- [ ] Create Postman collection
- [ ] Performance optimization
- [ ] Load testing
- [ ] Implement cache metrics & monitoring hooks
- [ ] Add cache invalidation/admin tooling (future)

**Total: ~84 hours (~2-3 months part-time)**

## Success Metrics

### Developer Experience
- Reduce API calls needed for common tasks by 80%
- Response times under 200ms (95th percentile) with cache
- Cache hit rate above 80%
- API availability > 99.9%

### Adoption
- Number of unique consumers
- Requests per day
- Most popular endpoints
- Developer satisfaction (surveys)

### Technical
- Battle.net API calls reduced by 60% (via caching)
- Error rate < 0.1%
- P95 response time < 500ms
- Zero downtime deployments

## Conclusion

This plan provides:

✅ **Full Battle.net API Coverage** - All major APIs mapped and planned
✅ **Significantly Better UX** - Flattened responses, computed metrics, smart caching
✅ **Incremental Approach** - Start with high-value quick wins
✅ **Production-Ready** - Comprehensive error handling, caching, monitoring
✅ **Developer-Friendly** - Excellent docs, batch operations, field filtering
✅ **Realistic Timeline** - ~84 hours over 2-3 months part-time

The quick wins alone (equipment, M+, raids, aggregate endpoints, leaderboards) will make this API **10x more useful** than raw Battle.net APIs while maintaining the clean design philosophy already established.

## Next Steps

1. **Review this plan** - Adjust priorities based on your specific needs
2. **Set up development environment** - Install cache dependencies
3. **Start with P0 quick wins** - Equipment + Mythic+ + Raids + aggregate endpoint
4. **Iterate based on usage** - Build what users actually need
5. **Monitor and optimize** - Use metrics to guide future development

---

**Questions? Feedback?** This is a living document. Update it as the API evolves!
