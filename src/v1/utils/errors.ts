export interface ApiErrorOptions {
  status: number
  code: string
  message: string
  details?: Record<string, unknown>
  cause?: unknown
}

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(options: ApiErrorOptions) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.details = options.details

    if (options.cause) {
      this.cause = options.cause
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
