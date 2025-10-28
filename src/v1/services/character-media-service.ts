import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CACHE_DURATIONS, CachedResult, getCachedValue } from '../utils/cache'

export interface CharacterMediaAsset {
  key: string
  value: string
}

export interface CharacterMediaSummary {
  avatar: string | null
  bust: string | null
  render: string | null
  mainRaw: string | null
  assets: CharacterMediaAsset[]
}

export interface CharacterMediaService {
  getCharacterMedia(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string
  ): Promise<CachedResult<CharacterMediaSummary>>
}

export function createCharacterMediaService(client: BattleNetClient): CharacterMediaService {
  return {
    async getCharacterMedia(game, region, realmSlug, name, locale) {
      const config = getGameConfig(game)
      if (!config.supportsProfiles) {
        throw new ApiError({
          status: 501,
          code: 'game:not_yet_supported',
          message: `Character media not yet supported for ${game}`
        })
      }

      const namespace = config.namespaces.profile(region)
      const characterPath = config.characterPath(realmSlug, name)

      try {
        return await getCachedValue<CharacterMediaSummary>({
          keyParts: ['character', game, region, realmSlug, name, 'media'],
          ttlMs: CACHE_DURATIONS.media,
          fetcher: async () => {
            const data = await client.fetchJson<CharacterMediaResponse>(
              `${characterPath}/character-media`,
              {
                region,
                locale,
                namespace
              }
            )

            const assets = (data.assets || [])
              .filter(isValidAsset)
              .map((asset) => ({
                key: asset.key,
                value: asset.value
              }))

            return {
              avatar: findAssetValue(assets, ['avatar', 'main']),
              bust: findAssetValue(assets, ['inset', 'bust']),
              render: findAssetValue(assets, ['main-raw', 'render']),
              mainRaw: findAssetValue(assets, ['main-raw']),
              assets
            }
          }
        })
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError({
          status: 500,
          code: 'character:media_failed',
          message: 'Unable to load character media from Battle.net API',
          details: { game, region, realmSlug, name },
          cause: error
        })
      }
    }
  }
}

function findAssetValue(assets: CharacterMediaAsset[], preferredKeys: string[]): string | null {
  for (const key of preferredKeys) {
    const match = assets.find((asset) => asset.key === key)
    if (match) {
      return match.value
    }
  }
  return null
}

function isValidAsset(asset: CharacterMediaAsset | CharacterMediaResponseAsset): asset is CharacterMediaAsset {
  return Boolean(asset && asset.key && typeof asset.key === 'string' && typeof asset.value === 'string')
}

interface CharacterMediaResponseAsset {
  key: string
  value: string
}

interface CharacterMediaResponse {
  assets?: CharacterMediaResponseAsset[]
}
