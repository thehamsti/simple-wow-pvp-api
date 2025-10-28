import { BattleNetClient } from './battlenet-client'
import { Region, SupportedGameId } from '../types'
import { getGameConfig } from '../utils/game-config'
import { ApiError } from '../utils/errors'
import { CACHE_DURATIONS, CachedResult, getCachedValue } from '../utils/cache'

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
  ): Promise<CachedResult<EquipmentSummary>>
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
        return await getCachedValue<EquipmentSummary>({
          keyParts: ['character', game, region, realmSlug, name, 'equipment'],
          ttlMs: CACHE_DURATIONS.equipment,
          fetcher: async () => {
            const data = await client.fetchJson<EquipmentResponse>(`${characterPath}/equipment`, {
              region,
              locale,
              namespace
            })

            return {
              averageItemLevel: data.average_item_level ?? null,
              equippedItemLevel: data.equipped_item_level ?? null,
              items: (data.equipped_items || []).map((item) => ({
                slot: normalizeSlot(item.slot.type),
                itemId: item.item.id,
                name: item.name || 'Unknown Item',
                quality: item.quality.type.toLowerCase(),
                level: item.level?.value ?? 0,
                enchantments: (item.enchantments || [])
                  .map((enchant) => enchant.display_string)
                  .filter(
                    (value): value is string =>
                      typeof value === 'string' && value.trim().length > 0
                  ),
                gems: (item.sockets || [])
                  .map((socket) => socket.item?.id)
                  .filter((id): id is number => typeof id === 'number'),
                bonus: item.bonus_list && item.bonus_list.length
                  ? `Bonus IDs: ${item.bonus_list.join(',')}`
                  : undefined
              }))
            }
          }
        })
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
    HEAD: 'head',
    NECK: 'neck',
    SHOULDER: 'shoulder',
    BACK: 'back',
    CHEST: 'chest',
    WRIST: 'wrist',
    HANDS: 'hands',
    WAIST: 'waist',
    LEGS: 'legs',
    FEET: 'feet',
    FINGER_1: 'finger1',
    FINGER_2: 'finger2',
    TRINKET_1: 'trinket1',
    TRINKET_2: 'trinket2',
    MAIN_HAND: 'mainHand',
    OFF_HAND: 'offHand'
  }
  return map[slot] ?? slot.toLowerCase()
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
