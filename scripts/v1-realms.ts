export {}

const args = process.argv.slice(2)
const [gameArg] = args

if (!gameArg) {
  console.error('Usage: bun scripts/v1-realms.ts <retail|classic-era|classic-wotlk|classic-hc>')
  process.exit(1)
}

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000/v1'
const region = process.env.TEST_REGION || process.env.BATTLE_NET_REGION || 'us'
const locale = process.env.TEST_LOCALE || 'en_US'

async function main() {
  const url = new URL(`${baseUrl}/${gameArg}/realms`)
  url.searchParams.set('region', region)
  url.searchParams.set('locale', locale)

  const response = await fetch(url.toString())
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Request failed (${response.status}): ${body}`)
  }

  const payload = await response.json()
  console.log(JSON.stringify(payload, null, 2))
}

main().catch((error) => {
  console.error('Failed to call /v1 realms endpoint', error)
  process.exit(1)
})
