import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CACHE_DURATIONS, CachedResult, getCachedValue } from '../utils/cache'

type CharacterPvpSeasonEntry = {
  bracket: string
  rating: number | null
  won: number
  lost: number
  played: number
  winRate: number | null
}

const DEFAULT_BRACKETS: Record<SupportedGameId, string[]> = {
  retail: ['2v2', '3v3', 'rbg', 'shuffle-overall'],
  'classic-era': ['2v2', '3v3', 'rbg'],
  'classic-wotlk': ['2v2', '3v3', 'rbg'],
  'classic-hc': ['2v2', '3v3', 'rbg']
}

const BRACKET_ID_ALIASES: Record<string, string> = {
  'shuffle-3v3': 'shuffle-overall',
  'solo_shuffle': 'shuffle-overall',
  'solo-shuffle': 'shuffle-overall',
  shuffle: 'shuffle-overall'
}

export interface CharacterSummary {
  name: string
  realm: string
  realmSlug: string
  level: number | null
  faction?: string | null
  race?: string | null
  characterClass?: string | null
  activeSpec?: string | null
  itemLevel?: {
    average: number | null
    equipped: number | null
  } | null
  lastLoginTimestamp?: number | null
}

export interface CharacterPvpSummary {
  season: CharacterPvpSeasonEntry[]
  honor?: {
    level: number | null
    honorableKills: number | null
  } | null
}

export interface CharacterService {
  getCharacterSummary(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string
  ): Promise<CachedResult<CharacterSummary>>
  getCharacterPvp(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string,
    brackets?: string[]
  ): Promise<CachedResult<CharacterPvpSummary>>
}

export function createCharacterService(client: BattleNetClient): CharacterService {
  return {
    async getCharacterSummary(game, region, realmSlug, name, locale) {
      const config = getGameConfig(game)
      if (!config.supportsProfiles) {
        throw new ApiError({
          status: 501,
          code: 'game:not_yet_supported',
          message: `Character summary not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.profile(region)
      const characterPath = config.characterPath(realmSlug, name)

      try {
        return await getCachedValue<CharacterSummary>({
          keyParts: ['character', game, region, locale, realmSlug, name, 'profile'],
          durationKey: 'profile',
          fetcher: async () => {
            const profile = await client.fetchJson<CharacterProfileResponse>(characterPath, {
              region,
              locale,
              namespace
            })

            return {
              name: profile.name,
              realm: pickString(
                profile.realm?.name,
                profile.realm?.slug,
                profile.realm?.nameLocalized,
                realmSlug
              )!,
              realmSlug: pickString(
                profile.realm?.slug,
                profile.realm?.nameSlug,
                profile.realm_slug,
                realmSlug
              )!,
              level: profile.level ?? profile.character_level ?? null,
              faction: pickString(
                isRecord(profile.faction) ? profile.faction.name : profile.faction,
                isRecord(profile.faction) ? profile.faction.type : undefined,
                profile.faction_name
              ),
              race: pickString(
                isRecord(profile.race) ? profile.race.name : profile.race,
                profile.race_name
              ),
              characterClass: pickString(
                profile.class?.name,
                isRecord(profile.character_class) ? profile.character_class.name : profile.character_class,
                profile.character_class_name
              ),
              activeSpec: pickString(
                profile.active_spec?.name,
                profile.active_specialization?.name,
                profile.active_specialization_name,
                profile.active_class_specialization?.name
              ),
              itemLevel:
                profile.average_item_level != null || profile.equipped_item_level != null
                  ? {
                      average: profile.average_item_level ?? null,
                      equipped: profile.equipped_item_level ?? null
                    }
                  : null,
              lastLoginTimestamp: normalizeTimestamp(
                profile.last_login_timestamp ?? profile.last_login ?? null
              )
            }
          }
        })
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'character:summary_failed',
          message: 'Unable to load character summary from Battle.net API',
          details: { game, region, realmSlug, name },
          cause: error
        })
      }
    },
    async getCharacterPvp(game, region, realmSlug, name, locale, brackets) {
      const config = getGameConfig(game)
      if (!config.supportsProfiles) {
        throw new ApiError({
          status: 501,
          code: 'game:not_yet_supported',
          message: `Character PvP is not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.profile(region)
      const characterPath = config.characterPath(realmSlug, name)

      const bracketKey = (brackets && brackets.length
        ? brackets
            .map((id) => resolveBracketRequestId(id) ?? id.trim().toLowerCase())
            .filter(Boolean)
            .join('|')
        : 'all'
      ).toLowerCase()

      try {
        return await getCachedValue<CharacterPvpSummary>({
          keyParts: [
            'character',
            game,
            region,
            locale,
            realmSlug,
            name,
            'pvp',
            bracketKey || 'all'
          ],
          durationKey: 'pvp',
          fetcher: async () => {
            const summary = await client.fetchJson<CharacterPvpSummaryResponse>(
              `${characterPath}/pvp-summary`,
              {
                region,
                locale,
                namespace
              }
            )

            const honor = summary
              ? {
                  level: summary.honor_level ?? null,
                  honorableKills: summary.pvp_honorable_kills ?? null
                }
              : null

            const bracketEntries = (summary?.brackets ?? [])
              .map((entry) => ({ ...entry, id: extractBracketId(entry.href) }))
              .filter((entry) => !!entry.id) as Array<{ href: string; id: string }>

            const entriesById = new Map<string, { href: string; id: string }>()
            for (const entry of bracketEntries) {
              const rawId = entry.id
              const resolvedId = resolveBracketRequestId(rawId) ?? rawId
              entriesById.set(resolvedId, { href: entry.href, id: resolvedId })
              entriesById.set(rawId, { href: entry.href, id: resolvedId })
            }

            const requestedBracketIdsRaw = brackets && brackets.length
              ? brackets
              : [
                  ...(DEFAULT_BRACKETS[game] ?? []),
                  ...bracketEntries.map((entry) => entry.id)
                ]

            const bracketIdsToFetch: string[] = []
            const seenBracketIds = new Set<string>()
            for (const rawId of requestedBracketIdsRaw) {
              const resolved = resolveBracketRequestId(rawId)
              if (!resolved || seenBracketIds.has(resolved)) {
                continue
              }
              seenBracketIds.add(resolved)
              bracketIdsToFetch.push(resolved)
            }

            const bracketTargets = bracketIdsToFetch.map((id) => {
              const existing = entriesById.get(id)
              const href = existing?.href ?? `${characterPath}/pvp-bracket/${id}`
              return { id, href }
            })

            const season = await Promise.all(
              bracketTargets.map(async (entry) => {
                try {
                  const details = await client.fetchJson<CharacterPvpBracketResponse>(entry.href, {
                    region,
                    locale,
                    namespace
                  })

                  const seasonStats = details.season_match_statistics ?? null
                  const won = seasonStats?.won ?? 0
                  const lost = seasonStats?.lost ?? 0
                  const played = seasonStats?.played ?? won + lost

                  return {
                    bracket: normalizeBracketId(entry.id),
                    rating: details.rating ?? null,
                    won,
                    lost,
                    played,
                    winRate: computeWinRate(won, lost)
                  }
                } catch (err) {
                  if (err instanceof ApiError && err.status === 404) {
                    return createEmptySeasonEntry(entry.id)
                  }
                  throw err
                }
              })
            )

            return {
              season,
              honor
            }
          }
        })
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'character:pvp_failed',
          message: 'Unable to load character PvP data from Battle.net API',
          details: { game, region, realmSlug, name },
          cause: error
        })
      }
    }
  }
}

function extractBracketId(href: string) {
  const match = href.match(/pvp-bracket\/([^/?]+)/)
  return match ? match[1].toLowerCase() : null
}

function normalizeBracketId(id: string) {
  const map: Record<string, string> = {
    '2v2': '2v2',
    '3v3': '3v3',
    rbg: 'rbg',
    'shuffle-3v3': 'solo_shuffle',
    'shuffle-overall': 'solo_shuffle',
    shuffle: 'solo_shuffle'
  }
  return map[id] ?? id
}

function resolveBracketRequestId(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return BRACKET_ID_ALIASES[normalized] ?? normalized
}

function createEmptySeasonEntry(id: string): CharacterPvpSeasonEntry {
  return {
    bracket: normalizeBracketId(id),
    rating: null,
    won: 0,
    lost: 0,
    played: 0,
    winRate: null
  }
}

function computeWinRate(won: number, lost: number) {
  const total = won + lost
  if (!total) return null
  return Math.round((won / total) * 1000) / 10
}

interface CharacterProfileResponse {
  name: string
  level?: number
  character_level?: number
  last_login_timestamp?: number
  last_login?: number | string
  realm?: {
    name?: string
    slug?: string
    nameLocalized?: string
    nameSlug?: string
  }
  realm_slug?: string
  class?: {
    name?: string
  }
  character_class?: { name?: string } | string
  character_class_name?: string
  active_spec?: { name?: string }
  active_class_specialization?: { name?: string }
  active_specialization?: { name?: string }
  active_specialization_name?: string
  race?: { name?: string } | string
  race_name?: string
  faction?: { name?: string; type?: string } | string
  faction_name?: string
  average_item_level?: number
  equipped_item_level?: number
}

interface CharacterPvpSummaryResponse {
  honor_level?: number
  pvp_honorable_kills?: number
  brackets?: Array<{ href: string }>
}

interface CharacterPvpBracketResponse {
  rating?: number
  season_match_statistics?: {
    played: number
    won: number
    lost: number
  }
  weekly_match_statistics?: {
    played: number
    won: number
    lost: number
  }
}

function pickString(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return null
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object'
}
