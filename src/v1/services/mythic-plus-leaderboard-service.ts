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
  getSpecBySlugs,
  listClassSlugs,
  PLAYABLE_CLASSES
} from '../utils/classes'

type LeaderboardMode = 'overall' | 'class' | 'dungeon'

export interface MythicPlusLeaderboardEntry {
  rank: number | null
  percentile: number | null
  mythicRating: number | null
  keystoneLevel: number | null
  completedAt: string | null
  durationMs: number | null
  time: {
    formatted: string | null
    seconds: number | null
  }
  dungeon: {
    id: number | null
    name: string | null
    slug: string | null
  }
  affixes: Array<{
    id: number | null
    name: string | null
    description?: string | null
  }>
  members: Array<{
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
    role: 'tank' | 'healer' | 'dps' | null
    faction: 'alliance' | 'horde' | null
  }>
}

export interface MythicPlusLeaderboardView {
  season: {
    id: number
    name: string | null
    slug: string | null
    startsAt: string | null
    endsAt: string | null
  }
  mode: LeaderboardMode
  leaderboard: {
    id: string
    name: string | null
  }
  entries: MythicPlusLeaderboardEntry[]
  total: number
  pagination: PaginationState
  filters: {
    region: Region
    class?: string | null
    spec?: string | null
    connectedRealmId?: number | null
    dungeonId?: number | null
    periodId?: number | null
    role?: 'tank' | 'healer' | 'dps' | null
    faction?: 'alliance' | 'horde' | null
    requested?: {
      class?: string
      spec?: string
      connectedRealmId?: number
      dungeonId?: number
      periodId?: number
      role?: string
      faction?: string
    }
  }
  updatedAt: string | null
  availableClasses: Array<{ class: string; specs: string[] }>
}

export interface MythicPlusLeaderboardOptions {
  seasonId?: number
  cursor?: string
  limit?: number
  classSlug?: string
  specSlug?: string
  connectedRealmId?: number
  dungeonId?: number
  periodId?: number
  role?: string
  faction?: string
  mode: LeaderboardMode
}

export interface MythicPlusLeaderboardService {
  getLeaderboard(
    game: SupportedGameId,
    region: Region,
    locale: string,
    options: MythicPlusLeaderboardOptions
  ): Promise<CachedResult<MythicPlusLeaderboardView>>
}

export function createMythicPlusLeaderboardService(
  client: BattleNetClient
): MythicPlusLeaderboardService {
  return {
    async getLeaderboard(game, region, locale, options) {
      const config = getGameConfig(game)
      if (game !== 'retail') {
        throw new ApiError({
          status: 501,
          code: 'leaderboard:not_supported',
          message: `Mythic+ leaderboards are not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.dynamic(region)
      const seasonInfo = await resolveSeasonInfo({
        client,
        region,
        locale,
        namespace,
        seasonId: options.seasonId
      })

      const normalizedFilters = normalizeFilters(options)

      const dataset = await getCachedValue<NormalizedMythicLeaderboard>({
        keyParts: buildCacheKeyParts({
          mode: options.mode,
          region,
          seasonId: seasonInfo.id,
          classSlug: normalizedFilters.classSlug,
          specSlug: normalizedFilters.specSlug,
          connectedRealmId: normalizedFilters.connectedRealmId,
          dungeonId: normalizedFilters.dungeonId,
          periodId: normalizedFilters.periodId
        }),
        durationKey: 'leaderboards',
        fetcher: async () => {
          const path = buildLeaderboardPath({
            seasonId: seasonInfo.id,
            mode: options.mode,
            classId: normalizedFilters.classId ?? undefined,
            specId: normalizedFilters.specId ?? undefined,
            connectedRealmId: normalizedFilters.connectedRealmId ?? undefined,
            dungeonId: normalizedFilters.dungeonId ?? undefined,
            periodId: normalizedFilters.periodId ?? undefined
          })

          const response = await client.fetchJson<RawMythicLeaderboardResponse>(path, {
            region,
            locale,
            namespace
          })

          return normalizeLeaderboardResponse(response, {
            mode: options.mode,
            seasonId: seasonInfo.id,
            classSlug: normalizedFilters.classSlug ?? undefined,
            specSlug: normalizedFilters.specSlug ?? undefined
          })
        }
      })

      const filteredEntries = applyEntryFilters(dataset.value.entries, normalizedFilters)
      const paginated = applyOffsetPagination(filteredEntries, {
        cursor: options.cursor,
        limit: options.limit,
        defaultLimit: 50,
        maxLimit: 200
      })

      const entries = paginated.results.map((entry, idx) =>
        enrichEntry(entry, paginated.state.offset + idx, paginated.total)
      )

      const requestedFilters = buildRequestedFilters(options)
      const hasRequested = Object.values(requestedFilters).some(
        (value) => value !== undefined && value !== null
      )

      return {
        value: {
          season: seasonInfo,
          mode: options.mode,
          leaderboard: dataset.value.leaderboard,
          entries,
          total: paginated.total,
          pagination: paginated.state,
          filters: {
            region,
            class: normalizedFilters.classSlug ?? null,
            spec: normalizedFilters.specSlug ?? null,
            connectedRealmId: normalizedFilters.connectedRealmId ?? null,
            dungeonId: normalizedFilters.dungeonId ?? null,
            periodId: normalizedFilters.periodId ?? null,
            role: normalizedFilters.role ?? null,
            faction: normalizedFilters.faction ?? null,
            ...(hasRequested ? { requested: requestedFilters } : {})
          },
          updatedAt: dataset.value.updatedAt,
          availableClasses: PLAYABLE_CLASSES.map((cls) => ({
            class: cls.slug,
            specs: cls.specs.map((spec) => spec.slug)
          }))
        },
        cacheMeta: dataset.cacheMeta
      }
    }
  }
}

interface NormalizeSeasonOptions {
  client: BattleNetClient
  region: Region
  locale: string
  namespace: string
  seasonId?: number
}

interface SeasonInfo {
  id: number
  name: string | null
  slug: string | null
  startsAt: string | null
  endsAt: string | null
}

async function resolveSeasonInfo(options: NormalizeSeasonOptions): Promise<SeasonInfo> {
  const { client, region, locale, namespace } = options

  const seasonId =
    options.seasonId ?? (await getCachedValue<number>({
      keyParts: ['mythic-plus', region, 'current-season'],
      ttlMs: CACHE_DURATIONS.leaderboards,
      fetcher: async () => {
        const data = await client.fetchJson<MythicKeystoneSeasonIndex>(
          '/data/wow/mythic-keystone/season/index',
          { region, locale, namespace }
        )

        const lastSeason = data.seasons?.at(-1)
        if (!lastSeason?.id) {
          throw new ApiError({
            status: 502,
            code: 'leaderboard:season_unavailable',
            message: 'Unable to determine active Mythic+ season from Battle.net API'
          })
        }
        return lastSeason.id
      }
    })).value

  const seasonDetails = await getCachedValue<SeasonInfo>({
    keyParts: ['mythic-plus', region, seasonId.toString(), 'details'],
    ttlMs: CACHE_DURATIONS.leaderboards,
    fetcher: async () => {
      const data = await client.fetchJson<MythicKeystoneSeasonDetails>(
        `/data/wow/mythic-keystone/season/${seasonId}`,
        { region, locale, namespace }
      )

      return {
        id: data.id ?? seasonId,
        name: data.name ?? null,
        slug: data.slug ?? null,
        startsAt: toIsoString(data.start_timestamp ?? data.start_time ?? data.start_date),
        endsAt: toIsoString(data.end_timestamp ?? data.end_time ?? data.end_date)
      }
    }
  })

  return seasonDetails.value
}

interface NormalizedFilters {
  classSlug?: string
  specSlug?: string
  classId?: number
  specId?: number
  connectedRealmId?: number
  dungeonId?: number
  periodId?: number
  role?: 'tank' | 'healer' | 'dps'
  faction?: 'alliance' | 'horde'
}

function normalizeFilters(options: MythicPlusLeaderboardOptions): NormalizedFilters {
  const normalized: NormalizedFilters = {}

  if (options.classSlug) {
    const classSlug = toSlug(options.classSlug)
    const classData = getClassBySlug(classSlug)
    if (!classData) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_class',
        message: `Unsupported class filter: ${options.classSlug}`
      })
    }
    normalized.classSlug = classData.slug
    normalized.classId = classData.id

    if (options.specSlug) {
      const specSlug = toSlug(options.specSlug)
      const specData = getSpecBySlugs(classData.slug, specSlug)
      if (!specData) {
        throw new ApiError({
          status: 400,
          code: 'leaderboard:invalid_spec',
          message: `Spec ${options.specSlug} is not available for class ${options.classSlug}`
        })
      }
      normalized.specSlug = specData.spec.slug
      normalized.specId = specData.spec.id
    }
  } else if (options.specSlug) {
    const specSlug = toSlug(options.specSlug)
    const candidates = findSpecAcrossClasses(specSlug)
    if (!candidates) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_spec',
        message: `Unsupported specialization filter: ${options.specSlug}`
      })
    }
    if (candidates.multiple) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:ambiguous_spec',
        message: `Spec ${options.specSlug} is available for multiple classes; include a class filter`
      })
    }
    normalized.specSlug = candidates.spec.slug
    normalized.specId = candidates.spec.id
    normalized.classSlug = candidates.classRef.slug
    normalized.classId = candidates.classRef.id
  }

  if (options.connectedRealmId != null) {
    const realmId = Number(options.connectedRealmId)
    if (!Number.isFinite(realmId) || realmId <= 0) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_connected_realm',
        message: 'connectedRealmId must be a positive integer'
      })
    }
    normalized.connectedRealmId = realmId
  }

  if (options.dungeonId != null) {
    const dungeonId = Number(options.dungeonId)
    if (!Number.isFinite(dungeonId) || dungeonId <= 0) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_dungeon',
        message: 'dungeonId must be a positive integer'
      })
    }
    normalized.dungeonId = dungeonId
  }

  if (options.periodId != null) {
    const periodId = Number(options.periodId)
    if (!Number.isFinite(periodId) || periodId <= 0) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_period',
        message: 'periodId must be a positive integer'
      })
    }
    normalized.periodId = periodId
  }

  if (options.role) {
    const normalizedRole = normalizeRole(options.role)
    if (!normalizedRole) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_role',
        message: `Unsupported role filter: ${options.role}`
      })
    }
    normalized.role = normalizedRole
  }

  if (options.faction) {
    const faction = normalizeFaction(options.faction)
    if (!faction) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:invalid_faction',
        message: `Unsupported faction filter: ${options.faction}`
      })
    }
    normalized.faction = faction
  }

  if (options.mode === 'dungeon') {
    if (normalized.connectedRealmId == null || normalized.dungeonId == null) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:dungeon_filters_required',
        message: 'connectedRealmId and dungeonId are required for dungeon leaderboards'
      })
    }
  } else if (options.mode === 'class') {
    if (normalized.classId == null) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:class_required',
        message: 'class filter is required for class leaderboards'
      })
    }
  }

  return normalized
}

function buildCacheKeyParts(params: {
  mode: LeaderboardMode
  region: Region
  seasonId: number
  classSlug?: string
  specSlug?: string
  connectedRealmId?: number
  dungeonId?: number
  periodId?: number
}) {
  const parts = ['leaderboard', 'mythic-plus', params.mode, params.region, `season-${params.seasonId}`]
  if (params.classSlug) parts.push(`class-${params.classSlug}`)
  if (params.specSlug) parts.push(`spec-${params.specSlug}`)
  if (params.connectedRealmId != null) parts.push(`cr-${params.connectedRealmId}`)
  if (params.dungeonId != null) parts.push(`dungeon-${params.dungeonId}`)
  if (params.periodId != null) parts.push(`period-${params.periodId}`)
  return parts
}

function buildLeaderboardPath(params: {
  seasonId: number
  mode: LeaderboardMode
  classId?: number
  specId?: number
  connectedRealmId?: number
  dungeonId?: number
  periodId?: number
}) {
  if (params.mode === 'class') {
    if (!params.classId) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:class_required',
        message: 'Class identifier is required for class leaderboards'
      })
    }
    const base = `/data/wow/leaderboard/mythic-plus/season/${params.seasonId}/class/${params.classId}`
    if (params.specId) {
      return `${base}/spec/${params.specId}`
    }
    return base
  }

  if (params.mode === 'dungeon') {
    if (!params.connectedRealmId || !params.dungeonId) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:dungeon_filters_required',
        message: 'connectedRealmId and dungeonId are required for dungeon leaderboards'
      })
    }
    if (!params.periodId) {
      throw new ApiError({
        status: 400,
        code: 'leaderboard:period_required',
        message: 'periodId is required for dungeon leaderboards'
      })
    }
    return `/data/wow/connected-realm/${params.connectedRealmId}/mythic-leaderboard/${params.dungeonId}/period/${params.periodId}`
  }

  return `/data/wow/leaderboard/mythic-plus/season/${params.seasonId}`
}

interface NormalizedMythicLeaderboard {
  leaderboard: {
    id: string
    name: string | null
  }
  entries: NormalizedLeaderboardEntry[]
  updatedAt: string | null
}

interface NormalizedLeaderboardEntry {
  rank: number | null
  rating: number | null
  keystoneLevel: number | null
  completedAt: number | string | null
  durationMs: number | null
  map: {
    id: number | null
    name: string | null
    slug: string | null
  }
  affixes: Array<{ id: number | null; name: string | null; description?: string | null }>
  members: Array<NormalizedMember>
}

interface NormalizedMember {
  characterId: number | null
  name: string | null
  realmId: number | null
  realmName: string | null
  realmSlug: string | null
  classId: number | null
  className: string | null
  specId: number | null
  specName: string | null
  faction: 'alliance' | 'horde' | null
  role: 'tank' | 'healer' | 'dps' | null
}

function normalizeLeaderboardResponse(
  response: RawMythicLeaderboardResponse,
  context: {
    mode: LeaderboardMode
    seasonId: number
    classSlug?: string
    specSlug?: string
  }
): NormalizedMythicLeaderboard {
  const entries = (response.entries ?? response.leading_groups ?? response.runs ?? []).map(
    (entry: any) => normalizeLeaderboardEntry(entry)
  )

  const leaderboardName =
    response.leaderboard?.name ??
    response.name ??
    (context.mode === 'class'
      ? buildClassLeaderboardName(context.classSlug, context.specSlug)
      : response.map?.name ?? null)

  const fallbackId = [context.mode, context.classSlug, context.specSlug]
    .filter(Boolean)
    .join('-')

  return {
    leaderboard: {
      id:
        response.leaderboard_id ??
        response.slug ??
        response.id ??
        (fallbackId || 'mythic-plus'),
      name: leaderboardName ?? null
    },
    entries,
    updatedAt: toIsoString(
      response.last_updated_timestamp ??
        response.last_modified_timestamp ??
        response.modified ??
        response.updated
    )
  }
}

function normalizeLeaderboardEntry(entry: any): NormalizedLeaderboardEntry {
  const mapData = entry.map ?? entry.dungeon ?? entry.instance ?? {}
  const duration =
    entry.duration ??
    entry.dungeon_run_duration ??
    entry.keystone_run_duration ??
    (entry.best_run && entry.best_run.duration)

  const completed =
    entry.completed_timestamp ??
    entry.completion_timestamp ??
    entry.best_run?.completed_timestamp ??
    null

  const rating =
    entry.rating ??
    entry.mythic_rating?.rating ??
    entry.mythic_plus_rating ??
    entry.keystone_rating ??
    null

  const keystoneLevel =
    entry.keystone_level ?? entry.level ?? entry.best_run?.keystone_level ?? null

  const members: Array<NormalizedMember> = (entry.members ?? entry.memberships ?? []).map(
    (member: any) => {
      const profile = member.profile ?? member.character ?? member.member ?? {}
      const realm = profile.realm ?? profile.realmInfo ?? {}
      const faction = normalizeFaction(member.faction?.type ?? member.faction?.name)
      const role = normalizeRole(member.role?.type ?? member.role)

      const classId = member.character_class?.id ?? member.class_id ?? member.class?.id ?? null
      const className =
        member.character_class?.name ?? member.class_name ?? member.class?.name ?? null

      const specId =
        member.specialization?.id ??
        member.spec_id ??
        member.class_specialization?.id ??
        null
      const specName =
        member.specialization?.name ??
        member.class_specialization?.name ??
        member.spec_name ??
        null

      return {
        characterId: profile.id ?? member.id ?? null,
        name: profile.name ?? member.name ?? null,
        realmId: realm.id ?? null,
        realmName: realm.name ?? realm.realmName ?? null,
        realmSlug: realm.slug ?? realm.realmSlug ?? null,
        classId,
        className,
        specId,
        specName,
        faction,
        role
      }
    }
  )

  const affixes =
    entry.keystone_affixes?.map((affix: any) => ({
      id: affix.id ?? affix.keystone_affix?.id ?? null,
      name: affix.name ?? affix.keystone_affix?.name ?? null,
      description: affix.description ?? null
    })) ?? []

  return {
    rank: entry.rank ?? entry.rating?.rank ?? entry.position ?? null,
    rating,
    keystoneLevel,
    completedAt: completed,
    durationMs: typeof duration === 'number' ? duration : null,
    map: {
      id: mapData.id ?? null,
      name: mapData.name ?? null,
      slug: mapData.slug ?? null
    },
    affixes,
    members
  }
}

function applyEntryFilters(
  entries: NormalizedLeaderboardEntry[],
  filters: NormalizedFilters
): NormalizedLeaderboardEntry[] {
  return entries.filter((entry) => {
    if (filters.role) {
      const hasRole = entry.members.some((member) => member.role === filters.role)
      if (!hasRole) return false
    }
    if (filters.faction) {
      const hasFaction = entry.members.some((member) => member.faction === filters.faction)
      if (!hasFaction) return false
    }
    if (filters.classId) {
      const hasClass = entry.members.some((member) => member.classId === filters.classId)
      if (!hasClass) return false
    }
    if (filters.specId) {
      const hasSpec = entry.members.some((member) => member.specId === filters.specId)
      if (!hasSpec) return false
    }
    return true
  })
}

function enrichEntry(
  entry: NormalizedLeaderboardEntry,
  index: number,
  total: number
): MythicPlusLeaderboardEntry {
  return {
    rank: entry.rank,
    percentile: computePercentile(index, total),
    mythicRating: entry.rating,
    keystoneLevel: entry.keystoneLevel,
    completedAt: toIsoString(entry.completedAt),
    durationMs: entry.durationMs,
    time: {
      formatted: entry.durationMs != null ? formatDuration(entry.durationMs) : null,
      seconds: entry.durationMs != null ? Math.round(entry.durationMs / 1000) : null
    },
    dungeon: {
      id: entry.map.id,
      name: entry.map.name,
      slug: entry.map.slug
    },
    affixes: entry.affixes,
    members: entry.members.map((member) => {
      const classData = member.classId != null ? getClassById(member.classId) : undefined
      const specData = member.specId != null ? getSpecById(member.specId) : undefined
      return {
        id: member.characterId,
        name: member.name,
        realm: {
          id: member.realmId,
          name: member.realmName,
          slug: member.realmSlug
        },
        class: {
          id: member.classId,
          name: member.className ?? classData?.name ?? null,
          slug: classData?.slug ?? null
        },
        spec: member.specId
          ? {
              id: member.specId,
              name: member.specName ?? specData?.spec.name ?? null,
              slug: specData?.spec.slug ?? null
            }
          : null,
        role: member.role,
        faction: member.faction
      }
    })
  }
}

function computePercentile(index: number, total: number) {
  if (total === 0) return null
  const rank = index + 1
  const percentile = ((total - rank + 1) / total) * 100
  return Math.round(percentile * 10) / 10
}

function normalizeFaction(value: string | undefined | null): 'alliance' | 'horde' | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'alliance') return 'alliance'
  if (normalized === 'horde') return 'horde'
  return null
}

function normalizeRole(value: string | undefined | null): 'tank' | 'healer' | 'dps' | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'tank') return 'tank'
  if (normalized === 'healer') return 'healer'
  if (normalized === 'dps' || normalized === 'damage') return 'dps'
  return null
}

function buildClassLeaderboardName(classSlug?: string, specSlug?: string) {
  if (!classSlug) return null
  const classData = getClassBySlug(classSlug)
  if (!classData) return null
  if (specSlug) {
    const specData = getSpecBySlugs(classSlug, specSlug)
    if (specData) {
      return `${specData.spec.name} ${classData.name} Leaderboard`
    }
  }
  return `${classData.name} Leaderboard`
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
    return new Date(value).toISOString()
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }
  return null
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs)) {
    return null
  }
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const millis = durationMs % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${Math.floor(millis / 10)
    .toString()
    .padStart(2, '0')}`
}

function findSpecAcrossClasses(specSlug: string) {
  let match:
    | {
        spec: { id: number; slug: string }
        classRef: { id: number; slug: string; name: string }
        multiple?: boolean
      }
    | null = null

  for (const classSlug of listClassSlugs()) {
    const classData = getClassBySlug(classSlug)
    if (!classData) continue
    const spec = classData.specs.find((candidate) => candidate.slug === specSlug)
    if (!spec) continue
    if (match) {
      return { ...match, multiple: true }
    }
    match = {
      spec: { id: spec.id, slug: spec.slug },
      classRef: { id: classData.id, slug: classData.slug, name: classData.name }
    }
  }

  return match
}

function buildRequestedFilters(options: MythicPlusLeaderboardOptions) {
  return {
    class: options.classSlug,
    spec: options.specSlug,
    connectedRealmId: options.connectedRealmId,
    dungeonId: options.dungeonId,
    periodId: options.periodId,
    role: options.role,
    faction: options.faction
  }
}

interface MythicKeystoneSeasonIndex {
  seasons?: Array<{ id: number }>
}

interface MythicKeystoneSeasonDetails {
  id?: number
  name?: string
  slug?: string
  start_timestamp?: number
  start_time?: number
  start_date?: string
  end_timestamp?: number
  end_time?: number
  end_date?: string
}

interface RawMythicLeaderboardResponse {
  leaderboard_id?: string
  leaderboard?: { name?: string }
  name?: string
  slug?: string
  id?: string
  map?: { name?: string }
  entries?: any[]
  runs?: any[]
  leading_groups?: any[]
  last_updated_timestamp?: number
  last_modified_timestamp?: number
  modified?: number
  updated?: number | string
}
