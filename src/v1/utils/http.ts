import type { Context } from 'hono'
import { z } from 'zod'
import { ApiError, isApiError } from './errors'

export const StandardResponseSchema = z.object({
  data: z.unknown(),
  meta: z
    .record(z.string(), z.unknown())
    .optional()
})

export type StandardResponse<T> = {
  data: T
  meta?: Record<string, unknown>
}

export function ok<T>(c: Context, body: StandardResponse<T>, status = 200) {
  return c.json(body, status as any)
}

export function handleError(c: Context, error: unknown) {
  if (isApiError(error)) {
    const payload = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    }
    return c.json(payload, error.status as any)
  }

  console.error('Unhandled error', error)
  const payload = {
    error: {
      code: 'server:unexpected',
      message: 'An unexpected error occurred'
    }
  }
  return c.json(payload, 500)
}

export function parseQueryParamList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}
