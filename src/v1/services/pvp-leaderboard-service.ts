import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CACHE_DURATIONS, CachedResult, getCachedValue } from '../utils/cache'
import { applyOffsetPagination, PaginationState } from '../utils/pagination'
import {
  getClassById,
  getClassBySlug,
  getSpecById,
  getSpecBySlugs
} from '../utils/classes'
import { listPvpBrackets, normalizePvpBracket } from '../utils/pvp-brackets'

const SUPPORTED_PVP_LEADERBOARD_GAMES: SupportedGameId[] = ['retail', 'classic-era']

export interface PvpLeaderboardEntry {
  rank: number | null
  rating: number | null
  percentile: number | null
  character: {
    id: number | null
    name: string | null
    realm: {
      id: number | null
      name: string | null
      slug: string | null
    }
    class: {
      id: number | null
      name: string | null
      slug: string | null
    }
    spec: {
      id: number | null
      name: string | null
      slug: string | null
    } | null
    faction: 'alliance' | 'horde' | null
  }
  statistics: {
    won: number
    lost: number
    played: number
    winRate: number | null
  }
}

export interface PvpLeaderboardView {
  season: {
    id: number
    name: string | null
    slug: string | null
    startsAt: string | null
    endsAt: string | null
  }
  bracket: {
    id: string
    name: string | null
  }
  entries: PvpLeaderboardEntry[]
  total: number
  pagination: PaginationState
  filters: {
    region: Region
    realm?: string | null
    class?: string | null
    spec?: string | null
    faction?: 'alliance' | 'horde' | null
    requested?: {
      realm?: string
      class?: string
      spec?: string
      faction?: string
    }
  }
  updatedAt: string | null
  availableBrackets: string[]
}

export interface PvpLeaderboardOptions {
  bracket: string
  seasonId?: number
  limit?: number
  cursor?: string
  filters?: {
    realm?: string
    class?: string
    spec?: string
    faction?: string
  }
}

export interface PvpLeaderboardService {
  getLeaderboard(
    game: SupportedGameId,
    region: Region,
    locale: string,
    options: PvpLeaderboardOptions
  ): Promise<CachedResult<PvpLeaderboardView>>
}

export function createPvpLeaderboardService(client: BattleNetClient): PvpLeaderboardService {
  return {
    async getLeaderboard(game, region, locale, options) {
      const config = getGameConfig(game)

      if (!SUPPORTED_PVP_LEADERBOARD_GAMES.includes(game)) {
        throw new ApiError({
          status: 501,
          code: 'leaderboard:not_supported',
          message: `PvP leaderboards are not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.dynamic(region)
      const bracket = normalizePvpBracket(game, options.bracket)

      const seasonInfo = await resolveSeasonInfo({
        client,
        game,
        region,
        locale,
        namespace,
        seasonId: options.seasonId
      })

      const seasonSegment =
        options.seasonId != null ? options.seasonId.toString() : seasonInfo.id.toString()

      const leaderboard = await getCachedValue<NormalizedPvpLeaderboard>({
        keyParts: [
          'leaderboard',
          'pvp',
          game,
          region,
          `season-${seasonInfo.id}`,
          bracket
        ],
        durationKey: 'leaderboards',
        fetcher: async () => {
          const path = `/data/wow/pvp-season/${seasonSegment}/pvp-leaderboard/${encodeURIComponent(
            bracket
          )}`

          const response = await client.fetchJson<PvpLeaderboardResponse>(path, {
            region,
            locale,
            namespace
          })

          return normalizeLeaderboardResponse(response, seasonInfo, bracket)
        }
      })

      const normalizedFilters = normalizeFilters(options.filters ?? {})
      const filteredEntries = applyFilters(leaderboard.value.entries, normalizedFilters)

      const paginated = applyOffsetPagination(filteredEntries, {
        cursor: options.cursor,
        limit: options.limit,
        defaultLimit: 50,
        maxLimit: 200
      })

      const entries = paginated.results.map((entry, idx) =>
        enrichEntry(entry, paginated.state.offset + idx, paginated.total)
      )

      const requestedFilters = {
        realm: normalizedFilters.input.realm,
        class: normalizedFilters.input.class,
        spec: normalizedFilters.input.spec,
        faction: normalizedFilters.input.faction
      }
      const hasRequestedFilters = Object.values(requestedFilters).some((value) => value != null)

      return {
        value: {
          season: leaderboard.value.season,
          bracket: leaderboard.value.bracket,
          entries,
          total: paginated.total,
          pagination: paginated.state,
          filters: {
            region,
            realm: normalizedFilters.realmSlug ?? null,
            class: normalizedFilters.classSlug ?? null,
            spec: normalizedFilters.specSlug ?? null,
            faction: normalizedFilters.faction ?? null,
            ...(hasRequestedFilters ? { requested: requestedFilters } : {})
          },
          updatedAt: leaderboard.value.updatedAt,
          availableBrackets: listPvpBrackets(game)
        },
        cacheMeta: leaderboard.cacheMeta
      }
    }
  }
}

interface SeasonInfo {
  id: number
  name: string | null
  slug: string | null
  startsAt: string | null
  endsAt: string | null
}

interface NormalizeSeasonOptions {
  client: BattleNetClient
  game: SupportedGameId
  region: Region
  locale: string
  namespace: string
  seasonId?: number
}

async function resolveSeasonInfo(options: NormalizeSeasonOptions): Promise<SeasonInfo> {
  const { client, game, region, locale, namespace, seasonId: requestedSeasonId } = options

  const seasonId =
    requestedSeasonId ??
    (await getCachedValue<number>({
      keyParts: ['pvp-season', game, region, 'current-id', 'v2'],
      ttlMs: CACHE_DURATIONS.leaderboards,
      fetcher: async () =>
        resolveSeasonIdFromIndex({
          client,
          game,
          region,
          locale,
          namespace
        })
    })).value

  const seasonDetails = await getCachedValue<SeasonInfo>({
    keyParts: ['pvp-season', game, region, seasonId.toString(), 'details'],
    ttlMs: CACHE_DURATIONS.leaderboards,
    fetcher: async () => {
      const data = await client.fetchJson<PvpSeasonDetailsResponse>(
        `/data/wow/pvp-season/${seasonId}`,
        {
          region,
          locale,
          namespace
        }
      )

      return buildSeasonInfo(data, seasonId)
    }
  })

  return seasonDetails.value
}

async function resolveSeasonIdFromIndex(options: NormalizeSeasonOptions): Promise<number> {
  const { client, region, locale, namespace } = options

  const data = await client.fetchJson<PvpSeasonIndexResponse>('/data/wow/pvp-season/index', {
    region,
    locale,
    namespace
  })

  const candidateIds = [
    data.current_season?.id,
    ...(data.seasons?.map((season) => season.id) ?? [])
  ].filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)

  if (!candidateIds.length) {
    throw new ApiError({
      status: 502,
      code: 'leaderboard:season_unavailable',
      message: 'Unable to determine active PvP season from Battle.net API'
    })
  }

  return Math.max(...candidateIds)
}

function buildSeasonInfo(data: PvpSeasonDetailsResponse, fallbackId: number): SeasonInfo {
  const name = pickLocalizedString(
    data.name,
    data.nameLocalized,
    data.season_name,
    data.season?.name
  )

  const slug =
    pickLocalizedString(data.slug, data.slugLocalized, data.season_slug, data.season?.slug) ??
    (name ? toSlug(name) : null)

  return {
    id: data.id ?? fallbackId,
    name,
    slug,
    startsAt: resolveTimestamp(
      data.start_timestamp,
      data.start_time,
      data.start_date,
      data.season_start_timestamp,
      data.season_start_time,
      data.season_start_date
    ),
    endsAt: resolveTimestamp(
      data.end_timestamp,
      data.end_time,
      data.end_date,
      data.season_end_timestamp,
      data.season_end_time,
      data.season_end_date
    )
  }
}

function pickLocalizedString(
  ...values: Array<string | Record<string, unknown> | null | undefined>
): string | null {
  for (const value of values) {
    const resolved = extractLocalizedString(value)
    if (resolved) {
      return resolved
    }
  }
  return null
}

function extractLocalizedString(
  value: string | Record<string, unknown> | null | undefined
): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>

  const candidates = [
    'en_US',
    'en_us',
    'en_GB',
    'en-gb',
    'en',
    'default',
    'value',
    'name',
    'display_string',
    'slug',
    'id'
  ]

  for (const key of candidates) {
    const entry = record[key]
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed.length) {
        return trimmed
      }
    }
  }

  for (const [key, entry] of Object.entries(record)) {
    if (key === 'href') {
      continue
    }
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed.length) {
        return trimmed
      }
    }
  }

  return null
}

function resolveTimestamp(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toIsoString(value)
    if (normalized) {
      return normalized
    }
  }
  return null
}

interface NormalizedEntry {
  rawRank: number | null
  rating: number | null
  characterId: number | null
  characterName: string | null
  realmId: number | null
  realmName: string | null
  realmSlug: string | null
  classId: number | null
  className: string | null
  classSlug: string | null
  specId: number | null
  specName: string | null
  specSlug: string | null
  faction: 'alliance' | 'horde' | null
  won: number
  lost: number
  played: number
  winRate: number | null
}

interface NormalizedPvpLeaderboard {
  season: SeasonInfo
  bracket: { id: string; name: string | null }
  entries: NormalizedEntry[]
  updatedAt: string | null
}

function normalizeLeaderboardResponse(
  response: PvpLeaderboardResponse,
  season: SeasonInfo,
  bracket: string
): NormalizedPvpLeaderboard {
  const entries = (response.entries ?? []).map((entry) => {
    const rawEntry = entry as Record<string, unknown>
    const rawCharacter = isRecord(rawEntry.character) ? rawEntry.character : {}

    const faction = normalizeFaction(
      (rawEntry.faction as any)?.type ?? (rawEntry.faction as any)?.name
    )

    const won =
      (rawEntry.season_match_statistics as any)?.won ??
      (rawEntry.match_statistics as any)?.won ??
      0
    const lost =
      (rawEntry.season_match_statistics as any)?.lost ??
      (rawEntry.match_statistics as any)?.lost ??
      0
    const played =
      (rawEntry.season_match_statistics as any)?.played ??
      (rawEntry.match_statistics as any)?.played ??
      Math.max(won + lost, 0)

    const realmSource =
      pickFirstRecord(
        rawCharacter.realm,
        rawEntry.realm,
        rawEntry.character_realm,
        rawEntry.connected_realm
      ) ?? null

    const realmId = pickFirstNumber(
      realmSource?.id,
      rawCharacter.realm_id,
      rawEntry.realm_id
    )
    const realmSlugSource = pickFirstString(
      realmSource?.slug,
      (realmSource as any)?.realm_slug,
      rawCharacter.realm_slug,
      rawEntry.realm_slug,
      rawEntry.connected_realm_slug
    )
    const realmSlug = realmSlugSource ? normalizeSlug(realmSlugSource) : null

    let realmName =
      pickFirstString(
        realmSource?.name,
        (realmSource as any)?.realmName,
        rawCharacter.realm_name,
        rawEntry.realm_name
      ) ?? null
    if (!realmName) {
      const slugForName =
        pickFirstString(
          (realmSource as any)?.slug,
          (realmSource as any)?.realm_slug,
          realmSlugSource
        ) ?? null
      if (slugForName) {
        const formatted = formatNameFromSlug(slugForName)
        if (formatted) {
          realmName = formatted
        }
      }
      if (!realmName && realmSlug) {
        const formatted = formatNameFromSlug(realmSlug)
        if (formatted) {
          realmName = formatted
        }
      }
    }

    const classSource =
      pickFirstRecord(
        rawEntry.playable_class,
        rawEntry.class,
        rawEntry.class_info,
        rawEntry.classInfo,
        rawEntry.character_class,
        rawEntry.characterClass,
        rawEntry.pvp_class,
        rawEntry.leaderboard_class,
        rawCharacter.playable_class,
        rawCharacter.class,
        rawCharacter.class_info,
        rawCharacter.character_class
      ) ?? null

    let classId = pickFirstNumber(
      classSource?.id,
      rawEntry.playable_class_id,
      rawEntry.class_id,
      rawEntry.classId,
      rawCharacter.playable_class_id,
      rawCharacter.class_id
    )
    let classSlug =
      normalizeSlug(
        pickFirstString(
          classSource?.slug,
          classSource?.name,
          rawEntry.class_slug,
          rawEntry.classSlug,
          rawCharacter.class_slug
        )
      ) ?? null
    let className =
      pickFirstString(
        classSource?.name,
        rawEntry.class_name,
        rawEntry.className,
        rawCharacter.class_name
      ) ?? null

    let classData =
      classId != null ? getClassById(classId) : classSlug ? getClassBySlug(classSlug) : undefined
    if (classData) {
      if (classId == null) classId = classData.id
      if (!classSlug) classSlug = classData.slug
      if (!className) className = classData.name
    }

    const specSource =
      pickFirstRecord(
        rawEntry.spec,
        rawEntry.specialization,
        rawEntry.class_specialization,
        rawEntry.spec_info,
        rawEntry.pvp_specialization,
        rawEntry.specialization_info,
        rawCharacter.spec,
        rawCharacter.specialization,
        rawCharacter.active_spec,
        rawCharacter.spec_info
      ) ?? null

    let specId = pickFirstNumber(
      specSource?.id,
      rawEntry.spec_id,
      rawEntry.specId,
      rawEntry.specialization_id,
      rawCharacter.spec_id
    )
    let specSlug =
      normalizeSlug(
        pickFirstString(
          specSource?.slug,
          specSource?.name,
          rawEntry.spec_slug,
          rawEntry.specSlug,
          rawEntry.specialization_slug,
          rawCharacter.spec_slug
        )
      ) ?? null
    let specName =
      pickFirstString(
        specSource?.name,
        rawEntry.spec_name,
        rawEntry.specName,
        rawEntry.specialization_name,
        rawCharacter.spec_name
      ) ?? null

    let specData = specId != null ? getSpecById(specId) : undefined
    if (!specData && specSlug && classSlug) {
      specData = getSpecBySlugs(classSlug, specSlug) ?? undefined
    }
    if (!specData && specSlug) {
      const cross = findSpecAcrossClasses(specSlug)
      if (cross && !cross.multiple) {
        specData = cross
      }
    }
    if (specData) {
      if (specId == null) specId = specData.spec.id
      if (!specSlug) specSlug = specData.spec.slug
      if (!specName) specName = specData.spec.name
      if (!classData) {
        classData = specData.classRef
      }
    }
    if (classData) {
      if (classId == null) classId = classData.id
      if (!classSlug) classSlug = classData.slug
      if (!className) className = classData.name
    }

    return {
      rawRank: entry.rank ?? null,
      rating: entry.rating ?? entry.ranking?.rating ?? null,
      characterId: rawCharacter.id ?? null,
      characterName: rawCharacter.name ?? null,
      realmId,
      realmName,
      realmSlug,
      classId,
      className,
      classSlug,
      specId,
      specName,
      specSlug,
      faction,
      won,
      lost,
      played,
      winRate: computeWinRate(won, lost)
    }
  })

  return {
    season,
    bracket: {
      id: bracket,
      name: response.name ?? response.bracket?.name ?? null
    },
    entries,
    updatedAt: toIsoString(
      response.last_updated_timestamp ??
        response.last_modified_timestamp ??
        response.modified ??
        response.modified_timestamp ??
        response.updated
    )
  }
}

interface NormalizedFilters {
  input: {
    realm?: string
    class?: string
    spec?: string
    faction?: 'alliance' | 'horde'
  }
  realmSlug?: string
  classId?: number
  classSlug?: string
  specId?: number
  specSlug?: string
  faction?: 'alliance' | 'horde'
}

function normalizeFilters(filters: PvpLeaderboardOptions['filters']): NormalizedFilters {
  const normalized: NormalizedFilters = {
    input: {}
  }

  if (!filters) {
    return normalized
  }

  if (filters.realm) {
    const realmSlug = toSlug(filters.realm)
    normalized.input.realm = filters.realm
    normalized.realmSlug = realmSlug
  }

  if (filters.faction) {
    const faction = normalizeFaction(filters.faction)
    if (!faction) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_faction',
        message: `Unsupported faction filter: ${filters.faction}`
      })
    }
    normalized.input.faction = faction
    normalized.faction = faction
  }

  let classSlug: string | undefined
  if (filters.class) {
    classSlug = toSlug(filters.class)
    const classData = getClassBySlug(classSlug)
    if (!classData) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_class',
        message: `Unsupported class filter: ${filters.class}`
      })
    }
    normalized.input.class = filters.class
    normalized.classId = classData.id
    normalized.classSlug = classData.slug
  }

  if (filters.spec) {
    const specSlug = toSlug(filters.spec)
    normalized.input.spec = filters.spec

    if (classSlug) {
      const specData = getSpecBySlugs(classSlug, specSlug)
      if (!specData) {
        throw new ApiError({
          status: 400,
          code: 'leaderboard:invalid_spec',
          message: `Spec ${filters.spec} is not available for class ${filters.class}`
        })
      }
      normalized.specId = specData.spec.id
      normalized.specSlug = specData.spec.slug
    } else {
      const directMatch = findSpecAcrossClasses(specSlug)
      if (!directMatch) {
        throw new ApiError({
          status: 400,
          code: 'leaderboard:invalid_spec',
          message: `Unsupported specialization filter: ${filters.spec}`
        })
      }
      if (directMatch.multiple) {
        throw new ApiError({
          status: 400,
          code: 'leaderboard:ambiguous_spec',
          message: `Spec ${filters.spec} is available for multiple classes; include a class filter`
        })
      }
      normalized.specId = directMatch.spec.id
      normalized.specSlug = directMatch.spec.slug
      normalized.classId = directMatch.classRef.id
      normalized.classSlug = directMatch.classRef.slug
      normalized.input.class ??= directMatch.classRef.name
    }
  }

  return normalized
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function pickFirstRecord<T extends Record<string, any>>(
  ...values: Array<unknown>
): T | null {
  for (const value of values) {
    if (isRecord(value)) {
      return value as T
    }
  }
  return null
}

function pickFirstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length) {
        return trimmed
      }
    }
  }
  return null
}

function toNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function pickFirstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    const numeric = toNumericId(value)
    if (numeric != null) {
      return numeric
    }
  }
  return null
}

function normalizeSlug(value: string | null): string | null {
  if (!value) {
    return null
  }
  return toSlug(value)
}

function formatNameFromSlug(value: string): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const segments = trimmed.split(/[-_\s]+/).filter(Boolean)
  if (!segments.length) {
    return null
  }
  return segments.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(' ')
}

function applyFilters(entries: NormalizedEntry[], filters: NormalizedFilters) {
  return entries.filter((entry) => {
    if (filters.realmSlug && entry.realmSlug !== filters.realmSlug) {
      return false
    }
    if (filters.classId != null && entry.classId !== filters.classId) {
      return false
    }
    if (filters.specId != null && entry.specId !== filters.specId) {
      return false
    }
    if (filters.faction && entry.faction !== filters.faction) {
      return false
    }
    return true
  })
}

function enrichEntry(entry: NormalizedEntry, index: number, total: number): PvpLeaderboardEntry {
  return {
    rank: entry.rawRank,
    rating: entry.rating,
    percentile: computePercentile(index, total),
    character: {
      id: entry.characterId,
      name: entry.characterName,
      realm: {
        id: entry.realmId,
        name: entry.realmName,
        slug: entry.realmSlug
      },
      class: {
        id: entry.classId,
        name: entry.className,
        slug: entry.classSlug
      },
      spec: entry.specId
        ? {
            id: entry.specId,
            name: entry.specName,
            slug: entry.specSlug
          }
        : null,
      faction: entry.faction
    },
    statistics: {
      won: entry.won,
      lost: entry.lost,
      played: entry.played,
      winRate: entry.winRate
    }
  }
}

function computePercentile(index: number, total: number) {
  if (total === 0) {
    return null
  }
  const rank = index + 1
  const percentile = ((total - rank + 1) / total) * 100
  return Math.round(percentile * 10) / 10
}

function computeWinRate(won: number, lost: number) {
  const total = won + lost
  if (!total) return null
  return Math.round((won / total) * 1000) / 10
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toIsoString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000
    return new Date(timestamp).toISOString()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.length) {
      return null
    }
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      return toIsoString(numeric)
    }
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }
  return null
}

function normalizeFaction(value: string | undefined | null): 'alliance' | 'horde' | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'alliance') return 'alliance'
  if (normalized === 'horde') return 'horde'
  return null
}

function findSpecAcrossClasses(specSlug: string) {
  let match:
    | {
        spec: { id: number; slug: string; name: string }
        classRef: { id: number; slug: string; name: string }
        multiple?: boolean
      }
    | null = null

  for (const playableClass of listCandidateClasses()) {
    const spec = playableClass.specs.find((candidate) => candidate.slug === specSlug)
    if (!spec) {
      continue
    }
    if (match) {
      return { ...match, multiple: true }
    }
    match = {
      spec: { id: spec.id, slug: spec.slug, name: spec.name },
      classRef: { id: playableClass.id, slug: playableClass.slug, name: playableClass.name }
    }
  }

  return match
}

const candidateClassesCache: NonNullable<ReturnType<typeof getClassBySlug>>[] = []

function listCandidateClasses() {
  if (candidateClassesCache.length) {
    return candidateClassesCache
  }
  const all = [
    'warrior',
    'paladin',
    'hunter',
    'rogue',
    'priest',
    'death-knight',
    'shaman',
    'mage',
    'warlock',
    'monk',
    'druid',
    'demon-hunter',
    'evoker'
  ]
  for (const slug of all) {
    const cls = getClassBySlug(slug)
    if (cls) {
      candidateClassesCache.push(cls)
    }
  }
  return candidateClassesCache
}

interface PvpSeasonIndexResponse {
  current_season?: { id: number }
  seasons?: Array<{ id: number }>
}

type LocalizedField = string | Record<string, unknown>

interface PvpSeasonDetailsResponse {
  id?: number
  name?: LocalizedField
  nameLocalized?: string
  slug?: LocalizedField
  slugLocalized?: string
  season?: {
    id?: number
    name?: LocalizedField
    slug?: LocalizedField
  }
  season_name?: LocalizedField
  season_slug?: LocalizedField
  start_timestamp?: number | string
  start_time?: number | string
  start_date?: string
  season_start_timestamp?: number | string
  season_start_time?: number | string
  season_start_date?: string
  end_timestamp?: number | string
  end_time?: number | string
  end_date?: string
  season_end_timestamp?: number | string
  season_end_time?: number | string
  season_end_date?: string
}

interface PvpLeaderboardResponse {
  name?: string
  bracket?: { name?: string }
  entries?: Array<PvpLeaderboardEntryResponse>
  last_updated_timestamp?: number
  last_modified_timestamp?: number
  modified?: number
  modified_timestamp?: number
  updated?: number | string
}

interface PvpLeaderboardEntryResponse {
  rank?: number
  rating?: number
  ranking?: { rating?: number }
  character?: {
    id?: number
    name?: string
    realm?: {
      id?: number
      name?: string
      slug?: string
    }
  }
  playable_class?: {
    id?: number
    name?: string
  }
  spec?: {
    id?: number
    name?: string
  }
  specialization?: {
    id?: number
    name?: string
  }
  faction?: {
    type?: string
    name?: string
  }
  match_statistics?: {
    played?: number
    won?: number
    lost?: number
  }
  season_match_statistics?: {
    played?: number
    won?: number
    lost?: number
  }
}
