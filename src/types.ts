import { z } from 'zod'

export interface BattleNetTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface PvPSummary {
  character: {
    name: string
    realm: {
      name: string
      slug: string
    }
  }
  honor_level: number
  pvp_honorable_kills: number
  rated_arena_slots: number
  rated_bg_slots: number
  brackets: {
    href: string
  }[]
}

export interface CharacterProfile {
  id: number
  name: string
  realm: {
    key: {
      href: string
    }
    name: string
    id: number
    slug: string
  }
  class: {
    key: {
      href: string
    }
    name: string
    id: number
  }
  active_spec: {
    key: {
      href: string
    }
    name: string
    id: number
  }
  faction: {
    type: string
    name: string
  }
  race: {
    key: {
      href: string
    }
    name: string
    id: number
  }
  gender: {
    type: string
    name: string
  }
  level: number
  experience: number
  achievement_points: number
  title?: {
    key: {
      href: string
    }
    name: string
    id: number
  }
  average_item_level: number
  equipped_item_level: number
  protected_character: boolean
  last_login_timestamp: number
  selected_professions?: {
    profession: {
      key: {
        href: string
      }
      name: string
      id: number
    }
    skill: number
    character_professions?: {
      href: string
    }
  }[]
  media?: {
    key: {
      href: string
    }
    assets: {
      key: string
      value: string
    }[]
  }
}

export interface PvPBracket {
  character: {
    name: string
    realm: {
      name: string
      slug: string
    }
  }
  bracket: {
    type: string
  }
  rating: number
  season_match_statistics: {
    played: number
    won: number
    lost: number
  }
  weekly_match_statistics: {
    played: number
    won: number
    lost: number
  }
}

export const CharacterSchema = z.object({
  name: z.string(),
  realm: z.string(),
  realm_slug: z.string(),
  class: z.string().optional(),
  spec: z.string().optional(),
  faction: z.string().optional(),
  race: z.string().optional(),
  gender: z.string().optional(),
  level: z.number().optional(),
  average_item_level: z.number().optional(),
  equipped_item_level: z.number().optional()
})

export const HonorSchema = z.object({
  level: z.number(),
  honorable_kills: z.number()
})

export const RatingSchema = z.object({
  rating: z.number().nullable(),
  won: z.number().nullable(),
  lost: z.number().nullable(),
  played: z.number().nullable(),
  rank: z.number().nullable()
})

export const RatingsSchema = z.object({
  '2v2': RatingSchema.nullable(),
  '3v3': RatingSchema.nullable(),
  'rbg': RatingSchema.nullable()
})

export const MatchStatisticsSchema = z.object({
  played: z.number(),
  won: z.number(),
  lost: z.number(),
  win_rate: z.number()
})

export const CharacterResponseSchema = z.object({
  character: CharacterSchema.optional(),
  honor: HonorSchema.optional(),
  ratings: RatingsSchema.optional(),
  last_updated: z.string().optional(),
  game_version: z.string().optional()
})

export const BracketResponseSchema = z.object({
  character: CharacterSchema.optional(),
  bracket: z.string().optional(),
  rating: z.number().optional(),
  season: MatchStatisticsSchema.optional(),
  weekly: MatchStatisticsSchema.optional(),
  last_updated: z.string().optional(),
  game_version: z.string().optional()
})

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional()
})

export const QuerySchema = z.object({
  region: z.enum(['us', 'eu', 'kr', 'tw']).optional().default('us'),
  locale: z.string().optional().default('en_US'),
  fields: z.string().optional(),
  stream_friendly: z.enum(['1']).optional()
})