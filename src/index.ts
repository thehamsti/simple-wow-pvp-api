import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { 
  rootRoute, 
  characterRoute, 
  classicCharacterRoute, 
  bracketRoute, 
  classicBracketRoute 
} from './routes'
import { 
  rootHandler, 
  characterHandler, 
  classicCharacterHandler, 
  bracketHandler, 
  classicBracketHandler 
} from './routes'
import { createV1App } from './v1'

const app = new OpenAPIHono()

app.openapi(rootRoute, rootHandler)
app.openapi(characterRoute, characterHandler)
app.openapi(classicCharacterRoute, classicCharacterHandler)
app.openapi(bracketRoute, bracketHandler)
app.openapi(classicBracketRoute, classicBracketHandler)

const v1App = createV1App()
app.route('/v1', v1App)

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'WoW Classic PvP Rank API',
    description: 'API for fetching WoW character PvP ratings and ranks from Battle.net API'
  },
  tags: [
    {
      name: 'legacy',
      description: 'Legacy endpoints retained for backward compatibility'
    }
  ]
})

app.get('/swagger', swaggerUI({ url: '/doc' }))
app.get(
  '/v1/swagger',
  swaggerUI({
    url: '/v1/doc',
    layout: 'BaseLayout',
    plugins: ['SwaggerUIBundle.plugins.TagGroupedLayout']
  })
)

export default app
