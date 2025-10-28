import { createRoute, z, OpenAPIHono } from '@hono/zod-openapi'
import { ok, handleError } from '../utils/http'
import type { BattleNetClient } from '../services/battlenet-client'

const StatusResponseSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    timestamp: z.string(),
    uptimeSeconds: z.number(),
    dependencies: z.object({
      battleNet: z.object({
        tokenCached: z.boolean(),
        regions: z.array(
          z.object({
            region: z.string(),
            expiresAt: z.string().nullable()
          })
        )
      })
    })
  })
})

const statusRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['meta'],
  responses: {
    200: {
      description: 'Service health',
      content: {
        'application/json': {
          schema: StatusResponseSchema
        }
      }
    }
  }
})

export interface StatusRouteDeps {
  battleNetClient: BattleNetClient
}

export function registerStatusRoutes(
  app: OpenAPIHono,
  deps: StatusRouteDeps
) {
  const statusApp = new OpenAPIHono()

  statusApp.openapi(statusRoute, (c) => {
    try {
      const tokenMeta = deps.battleNetClient.getTokenCacheMeta()
      const regions = Object.entries(tokenMeta).map(([region, meta]) => ({
        region,
        expiresAt: meta.expiresAt ? new Date(meta.expiresAt).toISOString() : null
      }))

      return ok(c, {
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptimeSeconds: process.uptime(),
          dependencies: {
            battleNet: {
              tokenCached: regions.some((entry) => !!entry.expiresAt),
              regions
            }
          }
        }
      })
    } catch (error) {
      return handleError(c, error) as any
    }
  })

  app.route('/status', statusApp)
}
