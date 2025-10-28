import { PLAYABLE_CLASSES } from './classes'
import { SupportedGameId } from '../types'
import { ApiError } from './errors'

const BASE_PVP_BRACKETS = ['2v2', '3v3', 'rbg'] as const
const CLASSIC_EXTRA_BRACKETS = ['5v5'] as const
const RETAIL_EXTRA_BRACKETS = ['shuffle-overall'] as const

export const SHUFFLE_SPEC_BRACKETS = PLAYABLE_CLASSES.flatMap((playableClass) =>
  playableClass.specs.map((spec) => `shuffle-${playableClass.slug}-${spec.slug}`)
)

const ALIASES: Record<string, string> = {
  'shuffle-3v3': 'shuffle-overall',
  'solo-shuffle': 'shuffle-overall',
  'solo_shuffle': 'shuffle-overall',
  shuffle: 'shuffle-overall'
}

export function listPvpBrackets(game: SupportedGameId): string[] {
  const base = [...BASE_PVP_BRACKETS]
  if (game === 'retail') {
    return [...base, ...RETAIL_EXTRA_BRACKETS, ...SHUFFLE_SPEC_BRACKETS]
  }
  if (game === 'classic-era') {
    return [...base, ...CLASSIC_EXTRA_BRACKETS]
  }
  return base
}

export function normalizePvpBracket(game: SupportedGameId, bracket: string): string {
  const normalized = bracket.trim().toLowerCase()
  if (!normalized) {
    throw new ApiError({
      status: 400,
      code: 'leaderboard:invalid_bracket',
      message: 'PvP bracket is required'
    })
  }

  const canonical = ALIASES[normalized] ?? normalized
  const validBrackets = listPvpBrackets(game)
  if (validBrackets.includes(canonical)) {
    return canonical
  }

  throw new ApiError({
    status: 400,
    code: 'leaderboard:unsupported_bracket',
    message: `Unsupported PvP bracket: ${bracket}`
  })
}

export function isShuffleBracket(game: SupportedGameId, bracket: string) {
  const canonical = normalizePvpBracket(game, bracket)
  return canonical === 'shuffle-overall' || canonical.startsWith('shuffle-')
}
