import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CACHE_DURATIONS, CachedResult, getCachedValue } from '../utils/cache'

export interface RaidDifficultyProgress {
  completed: number
  total: number
  percentage: number
}

export interface RaidBossKillInfo {
  killed: boolean
  firstKill: string | null
}

export interface RaidBossSummary {
  name: string
  slug: string | null
  normal: RaidBossKillInfo | null
  heroic: RaidBossKillInfo | null
  mythic: RaidBossKillInfo | null
}

export interface RaidInstanceSummary {
  id: number
  name: string
  slug: string | null
  expansion: string | null
  progress: {
    normal: RaidDifficultyProgress | null
    heroic: RaidDifficultyProgress | null
    mythic: RaidDifficultyProgress | null
  }
  bosses: RaidBossSummary[]
}

export interface RaidSummary {
  raids: RaidInstanceSummary[]
}

export interface RaidService {
  getRaidProgress(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string
  ): Promise<CachedResult<RaidSummary>>
}

export function createRaidService(client: BattleNetClient): RaidService {
  return {
    async getRaidProgress(game, region, realmSlug, name, locale) {
      const config = getGameConfig(game)
      if (!config.supportsProfiles) {
        throw new ApiError({
          status: 501,
          code: 'game:not_yet_supported',
          message: `Raid progression not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.profile(region)
      const characterPath = config.characterPath(realmSlug, name)

      try {
        return await getCachedValue<RaidSummary>({
          keyParts: ['character', game, region, realmSlug, name, 'raids'],
          ttlMs: CACHE_DURATIONS.raids,
          fetcher: async () => {
            const data = await client.fetchJson<CharacterRaidEncountersResponse>(
              `${characterPath}/encounters/raids`,
              {
                region,
                locale,
                namespace
              }
            )

            const raids = flattenRaidProgress(data)
            return { raids }
          }
        })
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'character:raids_failed',
          message: 'Unable to load character raid progression from Battle.net API',
          details: { game, region, realmSlug, name },
          cause: error
        })
      }
    }
  }
}

function flattenRaidProgress(data: CharacterRaidEncountersResponse): RaidInstanceSummary[] {
  const raids: RaidInstanceSummary[] = []

  for (const expansion of data.expansions ?? []) {
    const expansionName =
      expansion.expansion?.name ??
      expansion.name ??
      null

    for (const instance of expansion.instances ?? []) {
      const bosses = mergeBosses(instance.modes ?? [])

      raids.push({
        id: instance.instance?.id ?? instance.id ?? 0,
        name: instance.instance?.name ?? instance.name ?? 'Unknown',
        slug: instance.instance?.slug ?? null,
        expansion: expansionName,
        progress: {
          normal: extractProgress(instance.modes ?? [], 'NORMAL'),
          heroic: extractProgress(instance.modes ?? [], 'HEROIC'),
          mythic: extractProgress(instance.modes ?? [], 'MYTHIC')
        },
        bosses
      })
    }
  }

  return raids
}

function extractProgress(modes: CharacterRaidMode[], target: string): RaidDifficultyProgress | null {
  const mode = modes.find(
    (entry) => entry.difficulty?.type === target || entry.difficulty?.name === target
  )
  if (!mode) {
    return null
  }

  const total =
    mode.progress?.total_count ??
    mode.progress?.encounter_count ??
    mode.encounters?.length ??
    0

  const completed =
    mode.progress?.completed_count ??
    mode.progress?.kill_count ??
    (mode.encounters || []).reduce((sum, encounter) => sum + (encounter.completed_count ? 1 : 0), 0)

  const percentage = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0

  return {
    completed,
    total,
    percentage
  }
}

function mergeBosses(modes: CharacterRaidMode[]): RaidBossSummary[] {
  const bosses = new Map<string, RaidBossSummary>()

  for (const mode of modes) {
    const diff = normalizeDifficulty(mode.difficulty?.type ?? mode.difficulty?.name)
    if (!diff) {
      continue
    }

    for (const encounter of mode.encounters ?? []) {
      const id = fallbackEncounterKey(encounter.encounter)
      const existing =
        bosses.get(id) ??
        {
          name: encounter.encounter?.name ?? 'Unknown Boss',
          slug: encounter.encounter?.slug ?? null,
          normal: null,
          heroic: null,
          mythic: null
        }

      const killInfo: RaidBossKillInfo = {
        killed: (encounter.completed_count ?? 0) > 0,
        firstKill: normalizeTimestamp(encounter.last_kill_timestamp)
      }

      existing[diff] = killInfo
      bosses.set(id, existing)
    }
  }

  return Array.from(bosses.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function fallbackEncounterKey(encounter?: { id?: number; slug?: string; name?: string }) {
  if (!encounter) {
    return 'encounter-unknown'
  }
  if (encounter.id != null) {
    return `id-${encounter.id}`
  }
  if (encounter.slug) {
    return `slug-${encounter.slug}`
  }
  if (encounter.name) {
    return `name-${slugify(encounter.name)}`
  }
  return 'encounter-unknown'
}

function normalizeDifficulty(value: string | undefined | null): 'normal' | 'heroic' | 'mythic' | null {
  if (!value) {
    return null
  }
  const upper = value.toUpperCase()
  if (upper.includes('MYTHIC')) return 'mythic'
  if (upper.includes('HEROIC')) return 'heroic'
  if (upper.includes('NORMAL')) return 'normal'
  return null
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeTimestamp(value: number | string | undefined | null): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }
  return null
}

interface CharacterRaidEncountersResponse {
  expansions?: CharacterRaidExpansion[]
}

interface CharacterRaidExpansion {
  expansion?: { name?: string }
  name?: string
  instances?: CharacterRaidInstance[]
}

interface CharacterRaidInstance {
  instance?: { id?: number; name?: string; slug?: string }
  id?: number
  name?: string
  modes?: CharacterRaidMode[]
}

interface CharacterRaidMode {
  difficulty?: { type?: string; name?: string }
  progress?: {
    completed_count?: number
    total_count?: number
    encounter_count?: number
    kill_count?: number
  }
  encounters?: Array<{
    encounter?: { id?: number; name?: string; slug?: string }
    completed_count?: number
    last_kill_timestamp?: number | string
  }>
}
