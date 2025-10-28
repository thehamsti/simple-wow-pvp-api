import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CachedResult, getCachedValue } from '../utils/cache'

export interface RealmSummary {
  id: number
  slug: string
  name: string
  category?: string | null
  localeName?: string | null
  timezone?: string | null
  type?: string | null
  population?: string | null
}

export interface RealmService {
  listRealms(
    game: SupportedGameId,
    region: Region,
    locale: string
  ): Promise<CachedResult<RealmSummary[]>>
}

export function createRealmService(client: BattleNetClient): RealmService {
  return {
    async listRealms(game, region, locale) {
      const config = getGameConfig(game)

      const namespace = config.namespaces.dynamic(region)

      try {
        return await getCachedValue<RealmSummary[]>({
          keyParts: ['realms', game, region, locale],
          durationKey: 'realms',
          fetcher: async () => {
            const response = await client.fetchJson<RealmIndexResponse>('/data/wow/realm/index', {
              region,
              locale,
              namespace
            })

            return (response.realms || []).map((realm) => ({
              id: realm.id,
              slug: realm.slug,
              name: realm.name,
              category: realm.category ?? null,
              localeName: realm.nameLocalized ?? null,
              timezone: realm.timezone ?? null,
              type: realm.type?.name ?? realm.type ?? null,
              population: realm.population?.name ?? realm.population ?? null
            }))
          }
        })
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'realm:list_failed',
          message: 'Unable to retrieve realms from Battle.net API',
          details: { game, region },
          cause: error
        })
      }
    }
  }
}

interface RealmIndexResponse {
  realms: Array<{
    id: number
    name: string
    slug: string
    category?: string
    nameLocalized?: string
    timezone?: string
    type?: { name?: string } | string
    population?: { name?: string } | string
  }>
}
