export const SUPPORTED_GAMES = ['retail', 'classic-era', 'classic-wotlk', 'classic-hc'] as const
export type SupportedGameId = (typeof SUPPORTED_GAMES)[number]

export const SUPPORTED_REGIONS = ['us', 'eu', 'kr', 'tw'] as const
export type Region = (typeof SUPPORTED_REGIONS)[number]

export const DEFAULT_LOCALE: Record<Region, string> = {
  us: 'en_US',
  eu: 'en_GB',
  kr: 'ko_KR',
  tw: 'zh_TW'
}
