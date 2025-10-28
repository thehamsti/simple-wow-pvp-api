import { getGameConfig } from '../src/v1/utils/game-config'
import { SupportedGameId, Region } from '../src/v1/types'

async function main() {
  const [gameArg, realmArg, nameArg] = process.argv.slice(2)

  if (!gameArg || !realmArg || !nameArg) {
    console.error('Usage: bun scripts/official-character.ts <retail|classic-era|classic-wotlk|classic-hc> <realm-slug> <character-name>')
    process.exit(1)
  }

  const game = gameArg as SupportedGameId
  const region = (process.env.BATTLE_NET_REGION || 'us') as Region
  const locale = process.env.BATTLE_NET_LOCALE || 'en_US'

  const clientId = process.env.BATTLE_NET_CLIENT_ID
  const clientSecret = process.env.BATTLE_NET_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Missing BATTLE_NET_CLIENT_ID or BATTLE_NET_CLIENT_SECRET environment variables.')
    process.exit(1)
  }

  const config = getGameConfig(game)

  const token = await requestAccessToken(region, clientId, clientSecret)
  const namespace = config.namespaces.profile(region)
  const characterPath = config.characterPath(realmArg, nameArg)
  const origin = `https://${region}.api.blizzard.com`

  const summaryUrl = new URL(characterPath, origin)
  summaryUrl.searchParams.set('namespace', namespace)
  summaryUrl.searchParams.set('locale', locale)

  const pvpUrl = new URL(`${characterPath}/pvp-summary`, origin)
  pvpUrl.searchParams.set('namespace', namespace)
  pvpUrl.searchParams.set('locale', locale)

  const [profile, pvpSummary] = await Promise.all([
    battleNetFetch(summaryUrl.toString(), token),
    battleNetFetch(pvpUrl.toString(), token)
  ])

  console.log('=== Character Profile ===')
  console.log(JSON.stringify(profile, null, 2))
  console.log('\n=== PvP Summary ===')
  console.log(JSON.stringify(pvpSummary, null, 2))

  if (Array.isArray(pvpSummary?.brackets)) {
    for (const bracket of pvpSummary.brackets) {
      if (!bracket?.href) continue
      try {
        const data = await battleNetFetch(bracket.href, token)
        console.log(`\n--- Bracket ${bracket.href} ---`)
        console.log(JSON.stringify(data, null, 2))
      } catch (error) {
        console.error(`Failed to load bracket ${bracket.href}`, error)
      }
    }
  }
}

async function requestAccessToken(region: Region, clientId: string, clientSecret: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`https://${region}.battle.net/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to obtain Battle.net access token (${response.status}): ${body}`)
  }

  const payload = await response.json() as { access_token: string }
  return payload.access_token
}

async function battleNetFetch(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Battle.net request failed (${response.status}): ${body}`)
  }

  return response.json()
}

main().catch((error) => {
  console.error('Official API inspector failed', error)
  process.exit(1)
})
