import { CharacterService, CharacterSummary, CharacterPvpSummary } from './character-service'
import { EquipmentService, EquipmentSummary } from './equipment-service'
import { MythicPlusService, MythicPlusSummary } from './mythic-plus-service'
import { RaidService, RaidSummary } from './raid-service'
import { Region, SupportedGameId } from '../types'
import { ApiError } from '../utils/errors'

export type CharacterFullSection = 'profile' | 'equipment' | 'mythicPlus' | 'raids' | 'pvp'

export interface CharacterFullResult {
  profile?: CharacterSummary | null
  equipment?: EquipmentSummary | null
  mythicPlus?: MythicPlusSummary | null
  raids?: RaidSummary | null
  pvp?: CharacterPvpSummary | null
  requestedSections: CharacterFullSection[]
  fulfilledSections: CharacterFullSection[]
  failedSections: CharacterFullSection[]
  errors: CharacterFullError[]
}

export interface CharacterFullError {
  section: CharacterFullSection
  message: string
  code: string
  status: number
  details?: Record<string, unknown>
}

export interface CharacterFullService {
  getCharacterFull(
    game: SupportedGameId,
    region: Region,
    realmSlug: string,
    name: string,
    locale: string,
    sections: CharacterFullSection[]
  ): Promise<CharacterFullResult>
}

export interface CharacterFullServiceDeps {
  characterService: CharacterService
  equipmentService: EquipmentService
  mythicPlusService: MythicPlusService
  raidService: RaidService
}

const DEFAULT_SECTIONS: CharacterFullSection[] = [
  'profile',
  'equipment',
  'mythicPlus',
  'raids',
  'pvp'
]

export function createCharacterFullService(deps: CharacterFullServiceDeps): CharacterFullService {
  return {
    async getCharacterFull(game, region, realmSlug, name, locale, sections) {
      const requestedSections = sections.length ? sections : DEFAULT_SECTIONS

      const tasks = requestedSections.map((section) => ({
        section,
        exec: () => runSection(deps, section, game, region, realmSlug, name, locale)
      }))

      const results = await Promise.allSettled(tasks.map((task) => task.exec()))

      const payload: Partial<Record<CharacterFullSection, unknown>> = {}
      const fulfilledSections: CharacterFullSection[] = []
      const failedSections: CharacterFullSection[] = []
      const errors: CharacterFullError[] = []

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const section = tasks[i].section

        if (result.status === 'fulfilled') {
          payload[section] = result.value
          fulfilledSections.push(section)
        } else {
          failedSections.push(section)
          const error = result.reason
          if (error instanceof ApiError) {
            errors.push({
              section,
              code: error.code,
              message: error.message,
              status: error.status,
              details: error.details
            })
          } else {
            errors.push({
              section,
              code: 'server:unexpected',
              message: error instanceof Error ? error.message : 'Unexpected error',
              status: 500
            })
          }
        }
      }

      return {
        profile: payload.profile as CharacterSummary | null | undefined,
        equipment: payload.equipment as EquipmentSummary | null | undefined,
        mythicPlus: payload.mythicPlus as MythicPlusSummary | null | undefined,
        raids: payload.raids as RaidSummary | null | undefined,
        pvp: payload.pvp as CharacterPvpSummary | null | undefined,
        requestedSections,
        fulfilledSections,
        failedSections,
        errors
      }
    }
  }
}

async function runSection(
  deps: CharacterFullServiceDeps,
  section: CharacterFullSection,
  game: SupportedGameId,
  region: Region,
  realmSlug: string,
  name: string,
  locale: string
) {
  switch (section) {
    case 'profile':
      return (
        await deps.characterService.getCharacterSummary(game, region, realmSlug, name, locale)
      ).value
    case 'equipment':
      return (await deps.equipmentService.getEquipment(game, region, realmSlug, name, locale))
        .value
    case 'mythicPlus':
      return (
        await deps.mythicPlusService.getMythicPlus(game, region, realmSlug, name, locale)
      ).value
    case 'raids':
      return (await deps.raidService.getRaidProgress(game, region, realmSlug, name, locale)).value
    case 'pvp':
      return (
        await deps.characterService.getCharacterPvp(game, region, realmSlug, name, locale)
      ).value
    default:
      throw new ApiError({
        status: 400,
        code: 'request:invalid_section',
        message: `Unsupported section requested: ${section}`
      })
  }
}

export function isCharacterFullSection(value: string): value is CharacterFullSection {
  return (
    value === 'profile' ||
    value === 'equipment' ||
    value === 'mythicPlus' ||
    value === 'raids' ||
    value === 'pvp'
  )
}
