import { OpenAPIHono } from '@hono/zod-openapi'
import { createBattleNetClient } from './services/battlenet-client'
import { createCharacterService } from './services/character-service'
import { createCharacterMediaService } from './services/character-media-service'
import { createCharacterFullService } from './services/character-full-service'
import { createEquipmentService } from './services/equipment-service'
import { createMythicPlusService } from './services/mythic-plus-service'
import { createMythicPlusLeaderboardService } from './services/mythic-plus-leaderboard-service'
import { createRaidService } from './services/raid-service'
import { createRealmService } from './services/realm-service'
import { createPvpLeaderboardService } from './services/pvp-leaderboard-service'
import { registerCharacterRoutes } from './routes/characters'
import { registerEquipmentRoutes } from './routes/equipment'
import { registerCharacterMediaRoutes } from './routes/character-media'
import { registerMythicPlusRoutes } from './routes/mythic-plus'
import { registerRaidRoutes } from './routes/raids'
import { registerCharacterFullRoutes } from './routes/character-full'
import { registerMetaRoutes } from './routes/meta'
import { registerStatusRoutes } from './routes/status'
import { registerCacheRoutes } from './routes/cache'
import { registerPvpLeaderboardRoutes } from './routes/leaderboards-pvp'
import { registerMythicPlusLeaderboardRoutes } from './routes/leaderboards-mythic-plus'

export function createV1App() {
  const app = new OpenAPIHono()

  const battleNetClient = createBattleNetClient()
  const characterService = createCharacterService(battleNetClient)
  const equipmentService = createEquipmentService(battleNetClient)
  const mediaService = createCharacterMediaService(battleNetClient)
  const mythicPlusService = createMythicPlusService(battleNetClient)
  const raidService = createRaidService(battleNetClient)
  const pvpLeaderboardService = createPvpLeaderboardService(battleNetClient)
  const mythicPlusLeaderboardService = createMythicPlusLeaderboardService(battleNetClient)
  const fullService = createCharacterFullService({
    characterService,
    equipmentService,
    mythicPlusService,
    raidService
  })
  const realmService = createRealmService(battleNetClient)

  app.doc('/doc', {
    openapi: '3.1.0',
    info: {
      title: 'Unified WoW API v1',
      version: '1.0.0',
      description:
        'Streamlined World of Warcraft API that wraps the official Battle.net endpoints with easier to use payloads.'
    },
    tags: [
      { name: 'meta', description: 'Service metadata and status endpoints' },
      {
        name: 'characters',
        description:
          'Character summaries, PvP, equipment, media, Mythic+, raid progression, and aggregate views'
      },
      {
        name: 'leaderboards',
        description: 'PvP and Mythic+ leaderboard standings with pagination and filtering'
      },
      {
        name: 'cache',
        description: 'Cache inspection and diagnostics'
      }
    ],
    'x-tagGroups': [
      {
        name: 'Meta',
        tags: ['meta']
      },
      {
        name: 'Characters',
        tags: ['characters']
      },
      {
        name: 'Leaderboards',
        tags: ['leaderboards']
      },
      {
        name: 'Operations',
        tags: ['cache']
      }
    ]
  })

  registerStatusRoutes(app, { battleNetClient })
  registerMetaRoutes(app, { realmService })
  registerCharacterRoutes(app, { characterService })
  registerEquipmentRoutes(app, { equipmentService })
  registerCharacterMediaRoutes(app, { mediaService })
  registerMythicPlusRoutes(app, { mythicPlusService })
  registerRaidRoutes(app, { raidService })
  registerCharacterFullRoutes(app, { fullService })
  registerPvpLeaderboardRoutes(app, { pvpLeaderboardService })
  registerMythicPlusLeaderboardRoutes(app, { mythicPlusLeaderboardService })
  registerCacheRoutes(app)

  return app
}
