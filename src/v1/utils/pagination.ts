import { ApiError } from './errors'

export interface PaginationParams {
  cursor?: string | null
  limit?: number | null
  defaultLimit?: number
  maxLimit?: number
}

export interface PaginationState {
  limit: number
  offset: number
  cursor: string
  nextCursor: string | null
  previousCursor: string | null
}

export function applyOffsetPagination<T>(
  items: ReadonlyArray<T>,
  params: PaginationParams
): { results: T[]; state: PaginationState; total: number } {
  const total = items.length
  const limit = normalizeLimit(params.limit, params.defaultLimit ?? 50, params.maxLimit ?? 200)
  const offset = normalizeCursor(params.cursor, total)

  const boundedOffset = Math.min(Math.max(offset, 0), Math.max(total - 1, 0))
  const slice = items.slice(boundedOffset, boundedOffset + limit)

  const nextOffset = boundedOffset + limit
  const prevOffset = Math.max(boundedOffset - limit, 0)

  const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : null
  const previousCursor = boundedOffset > 0 ? encodeCursor(prevOffset) : null

  return {
    results: slice,
    total,
    state: {
      limit,
      offset: boundedOffset,
      cursor: encodeCursor(boundedOffset),
      nextCursor,
      previousCursor
    }
  }
}

function normalizeLimit(value: number | null | undefined, fallback: number, max: number) {
  const normalized = Number.isFinite(value) ? Number(value) : fallback
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new ApiError({
      status: 400,
      code: 'leaderboard:invalid_limit',
      message: 'The limit must be a positive integer'
    })
  }

  return Math.min(Math.max(Math.floor(normalized), 1), Math.max(Math.floor(max), 1))
}

function normalizeCursor(cursor: string | null | undefined, total: number) {
  if (!cursor) {
    return 0
  }

  const match = cursor.match(/^offset:(\d+)$/)
  if (!match) {
    throw new ApiError({
      status: 400,
      code: 'leaderboard:invalid_cursor',
      message: 'Cursor is invalid or malformed'
    })
  }

  const offset = Number.parseInt(match[1], 10)
  if (!Number.isFinite(offset)) {
    throw new ApiError({
      status: 400,
      code: 'leaderboard:invalid_cursor',
      message: 'Cursor offset is invalid'
    })
  }

  if (offset < 0) {
    return 0
  }

  if (offset >= total) {
    return Math.max(total - 1, 0)
  }

  return offset
}

function encodeCursor(offset: number) {
  return `offset:${Math.max(Math.floor(offset), 0)}`
}
