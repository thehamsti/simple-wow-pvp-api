export {}

const args = process.argv.slice(2)
const [gameArg, realmArg, nameArg] = args

if (!gameArg || !realmArg || !nameArg) {
  console.error('Usage: bun scripts/v1-character.ts <retail> <realm-slug> <character-name> [fields]')
  process.exit(1)
}

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000/v1'
const region = process.env.TEST_REGION || process.env.BATTLE_NET_REGION || 'us'
const locale = process.env.TEST_LOCALE || 'en_US'
const fieldsArg = args[3]

async function fetchJson(url: URL) {
  const response = await fetch(url.toString())
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Request failed (${response.status}): ${body}`)
  }
  return response.json()
}

async function main() {
  const summaryUrl = new URL(`${baseUrl}/${gameArg}/characters/${realmArg}/${nameArg}`)
  summaryUrl.searchParams.set('region', region)
  summaryUrl.searchParams.set('locale', locale)
  if (fieldsArg) {
    summaryUrl.searchParams.set('fields', fieldsArg)
  }

  const pvpUrl = new URL(`${baseUrl}/${gameArg}/characters/${realmArg}/${nameArg}/pvp`)
  pvpUrl.searchParams.set('region', region)
  pvpUrl.searchParams.set('locale', locale)

  const [summary, pvp] = await Promise.all([fetchJson(summaryUrl), fetchJson(pvpUrl)])

  console.log('=== /v1 character summary ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log('\n=== /v1 character PvP ===')
  console.log(JSON.stringify(pvp, null, 2))
}

main().catch((error) => {
  console.error('Failed to call /v1 character endpoints', error)
  process.exit(1)
})
