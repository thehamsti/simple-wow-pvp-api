import { SupportedGameId, Region } from '../types'
import { ApiError } from './errors'

interface NamespaceConfig {
  profile: (region: Region) => string
  dynamic: (region: Region) => string
}

interface GameConfig {
  id: SupportedGameId
  supportsProfiles: boolean
  namespaces: NamespaceConfig
  characterPath: (realmSlug: string, characterName: string) => string
}

const GAME_CONFIG: Record<SupportedGameId, GameConfig> = {
  retail: {
    id: 'retail',
    supportsProfiles: true,
    namespaces: {
      profile: (region) => `profile-${region}`,
      dynamic: (region) => `dynamic-${region}`
    },
    characterPath: (realmSlug, characterName) =>
      `/profile/wow/character/${encodeURIComponent(realmSlug.toLowerCase())}/${encodeURIComponent(
        characterName.toLowerCase()
      )}`
  },
  'classic-era': {
    id: 'classic-era',
    supportsProfiles: true,
    namespaces: {
      profile: (region) => `profile-classic-${region}`,
      dynamic: (region) => `dynamic-classic-${region}`
    },
    characterPath: (realmSlug, characterName) =>
      `/profile/wow/character/${encodeURIComponent(realmSlug.toLowerCase())}/${encodeURIComponent(
        characterName.toLowerCase()
      )}`
  },
  'classic-wotlk': {
    id: 'classic-wotlk',
    supportsProfiles: true,
    namespaces: {
      profile: (region) => `profile-classic1x-${region}`,
      dynamic: (region) => `dynamic-classic1x-${region}`
    },
    characterPath: (realmSlug, characterName) =>
      `/profile/wow/character/${encodeURIComponent(realmSlug.toLowerCase())}/${encodeURIComponent(
        characterName.toLowerCase()
      )}`
  },
  'classic-hc': {
    id: 'classic-hc',
    supportsProfiles: true,
    namespaces: {
      profile: (region) => `profile-classic-${region}`,
      dynamic: (region) => `dynamic-classic-${region}`
    },
    characterPath: (realmSlug, characterName) =>
      `/profile/wow/character/${encodeURIComponent(realmSlug.toLowerCase())}/${encodeURIComponent(
        characterName.toLowerCase()
      )}`
  }
}

export function getGameConfig(game: SupportedGameId): GameConfig {
  const config = GAME_CONFIG[game]
  if (!config) {
    throw new ApiError({
      status: 400,
      code: 'game:unsupported',
      message: `Unsupported game id: ${game}`
    })
  }
  return config
}
