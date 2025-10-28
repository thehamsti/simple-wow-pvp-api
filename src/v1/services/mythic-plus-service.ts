import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CACHE_DURATIONS, CachedResult, getCachedValue } from '../utils/cache'

export interface MythicPlusRunSummary {
  dungeon: string
  dungeonSlug: string | null
  level: number
  time: number | null
  completedAt: string | null
  score: number | null
  affixes: string[]
}

export interface MythicPlusDungeonScore {
  fortified?: number | null
  tyrannical?: number | null
  best?: number | null
}

export interface MythicPlusSummary {
  currentScore: number | null
  previousScore: number | null
  bestRuns: MythicPlusRunSummary[]
  dungeonScores: Record<string, MythicPlusDungeonScore>
}

export interface MythicPlusService {
  getMythicPlus(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string
  ): Promise<CachedResult<MythicPlusSummary>>
}

export function createMythicPlusService(client: BattleNetClient): MythicPlusService {
  return {
    async getMythicPlus(game, region, realmSlug, name, locale) {
      const config = getGameConfig(game)
      if (!config.supportsProfiles) {
        throw new ApiError({
          status: 501,
          code: 'game:not_yet_supported',
          message: `Mythic+ data not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.profile(region)
      const characterPath = config.characterPath(realmSlug, name)

      try {
        return await getCachedValue<MythicPlusSummary>({
          keyParts: ['character', game, region, realmSlug, name, 'mythic-plus'],
          ttlMs: CACHE_DURATIONS.mythicPlus,
          fetcher: async () => {
            const data = await client.fetchJson<MythicKeystoneProfileResponse>(
              `${characterPath}/mythic-keystone-profile`,
              {
                region,
                locale,
                namespace
              }
            )

            const bestRuns = normalizeBestRuns(data)
            const dungeonScores = computeDungeonScores(bestRuns)

            return {
              currentScore: data.current_mythic_rating?.rating ?? null,
              previousScore: data.previous_mythic_rating?.rating ?? null,
              bestRuns,
              dungeonScores
            }
          }
        })
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'character:mythic_plus_failed',
          message: 'Unable to load character Mythic+ data from Battle.net API',
          details: { game, region, realmSlug, name },
          cause: error
        })
      }
    }
  }
}

function normalizeBestRuns(data: MythicKeystoneProfileResponse): MythicPlusRunSummary[] {
  const runs =
    data.season_best_runs ||
    data.current_period?.best_runs ||
    data.best_runs ||
    []

  return runs.map((run) => ({
    dungeon: run.dungeon?.name ?? 'Unknown Dungeon',
    dungeonSlug: run.dungeon?.slug ?? null,
    level: run.keystone_level ?? 0,
    time: run.duration_ms ?? run.duration ?? null,
    completedAt: normalizeTimestamp(run.completed_timestamp),
    score: run.mythic_rating?.rating ?? null,
    affixes: (run.keystone_affixes || [])
      .map((affix) => affix.name)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      )
  }))
}

function computeDungeonScores(runs: MythicPlusRunSummary[]): Record<string, MythicPlusDungeonScore> {
  const scores: Record<string, MythicPlusDungeonScore> = {}

  for (const run of runs) {
    const key = run.dungeonSlug ?? slugify(run.dungeon)
    const isTyrannical = run.affixes.some((name) => equalsIgnoreCase(name, 'Tyrannical'))
    const isFortified = run.affixes.some((name) => equalsIgnoreCase(name, 'Fortified'))

    const entry = scores[key] ?? { fortified: null, tyrannical: null, best: null }

    if (isTyrannical) {
      entry.tyrannical = pickBest(entry.tyrannical, run.score)
    } else if (isFortified) {
      entry.fortified = pickBest(entry.fortified, run.score)
    } else if (entry.best == null) {
      entry.best = run.score ?? null
    }

    const best = Math.max(
      ...(entry.fortified != null ? [entry.fortified] : []),
      ...(entry.tyrannical != null ? [entry.tyrannical] : []),
      ...(run.score != null ? [run.score] : []),
      ...(entry.best != null ? [entry.best] : [])
    )
    entry.best = Number.isFinite(best) ? best : entry.best ?? run.score ?? null

    scores[key] = entry
  }

  return scores
}

function pickBest(existing: number | null | undefined, next: number | null): number | null {
  if (existing == null) {
    return next ?? null
  }
  if (next == null) {
    return existing
  }
  return Math.max(existing, next)
}

function equalsIgnoreCase(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
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

interface MythicKeystoneProfileResponse {
  current_mythic_rating?: MythicRating
  previous_mythic_rating?: MythicRating
  best_runs?: MythicKeystoneRun[]
  season_best_runs?: MythicKeystoneRun[]
  current_period?: {
    best_runs?: MythicKeystoneRun[]
  }
}

interface MythicRating {
  rating?: number
}

interface MythicKeystoneRun {
  dungeon?: { name?: string; slug?: string }
  keystone_level?: number
  duration?: number
  duration_ms?: number
  completed_timestamp?: number | string
  mythic_rating?: { rating?: number }
  keystone_affixes?: Array<{ name?: string }>
}
