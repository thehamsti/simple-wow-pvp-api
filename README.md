# WoW PvP Rank API

A comprehensive API service that wraps the official Battle.net World of Warcraft APIs behind a friendlier surface. The project now ships a new `/v1` versioned API that unifies metadata, realm lookup, and character data across game flavors while keeping the legacy endpoints untouched for backwards compatibility.

## Features

- **Versioned `/v1` API**: Clean resource layout (`status`, `meta`, `realms`, `characters`) with consistent response envelopes.
- **Human-Friendly Responses**: Flattened payloads, optional field filtering, and derived PvP win rates.
- **Multi-Game Support**: Retail plus Classic Era / Wrath / Hardcore character + PvP data via the same shapes; legacy routes remain intact.
- **Shared Battle.net Adapter**: Centralized token caching, retry-friendly error surfaces.
- **Testing Utilities**: Bun scripts to inspect official API responses and hit the new `/v1` routes with real credentials.

## `/v1` API Overview

All new routes live under the `/v1` prefix and return a standard envelope of `{ data, meta }`.

| Endpoint | Description |
| --- | --- |
| `GET /v1/status` | Service health, uptime, and token cache metadata. |
| `GET /v1/meta/games` | Supported game variants (retail, classic flavors). |
| `GET /v1/meta/regions` | Supported regions with default locales. |
| `GET /v1/{game}/realms` | Realm index for the selected game+region. |
| `GET /v1/{game}/characters/{realm}/{name}` | Character summary with optional `fields` filtering. |
| `GET /v1/{game}/characters/{realm}/{name}/pvp` | PvP overview (season stats, honor, win rates). |

`game` accepts `retail`, `classic-era`, `classic-wotlk`, and `classic-hc`. Classic payloads expose the same flattened summary/win-rate format; missing upstream stats simply appear as `null`.

### Example

```bash
# Character summary and PvP data (server must be running on port 3000)
curl "http://localhost:3000/v1/retail/characters/area-52/thiaba?region=us&locale=en_US"
curl "http://localhost:3000/v1/retail/characters/area-52/thiaba/pvp?region=us"

# Realm index
curl "http://localhost:3000/v1/retail/realms?region=us"

# Classic Era example
curl "http://localhost:3000/v1/classic-era/characters/whitemane/foobarius/pvp?region=us"
```

## Setup

### 1. Install Dependencies

```sh
bun install
```

### 2. Get Battle.net API Credentials

1. Visit the [Battle.net Developer Portal](https://develop.battle.net/)
2. Sign in with your Battle.net account
3. Go to "My Apps" and create a new client
4. Set the redirect URI to `http://localhost:3000/callback` (or any valid URI)
5. Note down your **Client ID** and **Client Secret**

### 3. Configure Environment Variables

1. Copy the example environment file:
```sh
cp .env.example .env
```

2. Edit the `.env` file with your Battle.net credentials:
```env
BATTLE_NET_CLIENT_ID=your_client_id_here
BATTLE_NET_CLIENT_SECRET=your_client_secret_here
BATTLE_NET_REGION=us
DEFAULT_LOCALE=en_US
```

**Environment Variables:**
- `BATTLE_NET_CLIENT_ID`: Your Battle.net client ID (required)
- `BATTLE_NET_CLIENT_SECRET`: Your Battle.net client secret (required)
- `BATTLE_NET_REGION`: Default region (us, eu, kr, tw) - defaults to `us`
- `DEFAULT_LOCALE`: Default locale (en_US, en_GB, etc.) - defaults to `en_US`

### 4. Run the Development Server

```sh
bun run dev
```

The API will be available at `http://localhost:3000` or the next available port (3001, 3002, etc.) if port 3000 is in use. The console will show the actual port used.

## Test Scripts

Quick Bun scripts are available to compare the official Battle.net payloads against the new `/v1` responses. All scripts expect `BATTLE_NET_CLIENT_ID` and `BATTLE_NET_CLIENT_SECRET` in your environment.

```bash
# Inspect the raw Battle.net profile + PvP summary (prints JSON for each bracket)
bun scripts/official-character.ts retail area-52 thiaba

# Hit the new /v1 character summary + PvP endpoints on the running server
bun scripts/v1-character.ts retail area-52 thiaba

# List realms for a given game + region via /v1
bun scripts/v1-realms.ts retail
```

Set `API_BASE_URL`, `TEST_REGION`, or `TEST_LOCALE` to override the defaults (`http://localhost:3000/v1`, `us`, `en_US` respectively).

## Legacy API Endpoints

The original routes remain available without the `/v1` prefix for clients that rely on them today. They continue to behave exactly as before.

### GET `/`

Returns API information, available endpoints, and parameter documentation.

### GET `/character/:realm/:name`

Fetches comprehensive PvP ratings and rank information for retail WoW characters.

**Parameters:**
- `realm` (path): Character realm name (e.g., "azralon", "tichondrius")
- `name` (path): Character name (e.g., "leeroy")

**Query Parameters:**
- `region` (optional): Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale` (optional): Locale code (e.g., `en_US`, `en_GB`) - defaults to `en_US`
- `fields` (optional): Comma-separated list of fields to return - defaults to all fields
- `stream_friendly` (optional): Set to `1` to return plain text format instead of JSON

**Available Fields for Character Endpoints:**
- `character`: Character name and realm information
- `honor`: Honor level and honorable kills
- `ratings`: PvP bracket ratings (2v2, 3v3, RBG)
- `last_updated`: Timestamp of last data fetch

### GET `/classic-mop/character/:realm/:name`

Fetches comprehensive PvP ratings and rank information for WoW Classic MoP characters using the `profile-classic-{region}` namespace.

**Parameters:**
- `realm` (path): Character realm name (e.g., "azralon", "tichondrius")
- `name` (path): Character name (e.g., "leeroy")

**Query Parameters:**
- `region` (optional): Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale` (optional): Locale code (e.g., `en_US`, `en_GB`) - defaults to `en_US`
- `fields` (optional): Comma-separated list of fields to return - defaults to all fields
- `stream_friendly` (optional): Set to `1` to return plain text format instead of JSON

**Available Fields for Classic MoP Character Endpoints:**
- `character`: Character name and realm information
- `honor`: Honor level and honorable kills
- `ratings`: PvP bracket ratings (2v2, 3v3, RBG)
- `last_updated`: Timestamp of last data fetch
- `game_version`: Game version identifier ("classic-mop")

### GET `/character/:realmSlug/:characterName/pvp-bracket/:pvpBracket`

Fetches specific PvP bracket data for retail WoW characters with detailed statistics.

**Parameters:**
- `realmSlug` (path): Character realm slug (e.g., "azralon", "tichondrius")
- `characterName` (path): Character name (e.g., "leeroy")
- `pvpBracket` (path): PvP bracket type (`2v2`, `3v3`, `rbg`)

**Query Parameters:**
- `region` (optional): Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale` (optional): Locale code (e.g., `en_US`, `en_GB`) - defaults to `en_US`
- `fields` (optional): Comma-separated list of fields to return - defaults to all fields
- `stream_friendly` (optional): Set to `1` to return plain text format instead of JSON

**Available Fields for Bracket Endpoints:**
- `character`: Character name and realm information
- `bracket`: PvP bracket type
- `rating`: Current rating
- `season`: Season match statistics (played, won, lost, win_rate)
- `weekly`: Weekly match statistics (played, won, lost, win_rate)
- `last_updated`: Timestamp of last data fetch

### GET `/classic-mop/character/:realmSlug/:characterName/pvp-bracket/:pvpBracket`

Fetches specific PvP bracket data for WoW Classic MoP characters with detailed statistics.

**Parameters:**
- `realmSlug` (path): Character realm slug (e.g., "azralon", "tichondrius")
- `characterName` (path): Character name (e.g., "leeroy")
- `pvpBracket` (path): PvP bracket type (`2v2`, `3v3`, `rbg`)

**Query Parameters:**
- `region` (optional): Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale` (optional): Locale code (e.g., `en_US`, `en_GB`) - defaults to `en_US`
- `fields` (optional): Comma-separated list of fields to return - defaults to all fields
- `stream_friendly` (optional): Set to `1` to return plain text format instead of JSON

**Available Fields for Classic MoP Bracket Endpoints:**
- `character`: Character name and realm information
- `bracket`: PvP bracket type
- `rating`: Current rating
- `season`: Season match statistics (played, won, lost, win_rate)
- `weekly`: Weekly match statistics (played, won, lost, win_rate)
- `last_updated`: Timestamp of last data fetch
- `game_version`: Game version identifier ("classic-mop")

**Example Requests:**

```bash
# Retail WoW character summary
curl http://localhost:3000/character/azralon/leeroy

# Retail WoW with region and locale
curl "http://localhost:3000/character/azralon/leeroy?region=us&locale=en_US"

# Retail WoW with field filtering
curl "http://localhost:3000/character/azralon/leeroy?fields=character,ratings"

# Retail WoW stream-friendly format
curl "http://localhost:3000/character/azralon/leeroy?stream_friendly=1"

# Retail WoW specific bracket
curl http://localhost:3000/character/azralon/leeroy/pvp-bracket/2v2

# Retail WoW bracket with field filtering
curl "http://localhost:3000/character/azralon/leeroy/pvp-bracket/3v3?fields=rating,season"

# Classic MoP character summary
curl http://localhost:3000/classic-mop/character/azralon/leeroy

# Classic MoP with region and locale
curl "http://localhost:3000/classic-mop/character/azralon/leeroy?region=us&locale=en_US"

# Classic MoP European realm
curl "http://localhost:3000/classic-mop/character/ragnaros/guldan?region=eu&locale=en_GB"

# Classic MoP specific bracket
curl http://localhost:3000/classic-mop/character/azralon/leeroy/pvp-bracket/rbg

# Classic MoP bracket stream-friendly format
curl "http://localhost:3000/classic-mop/character/azralon/leeroy/pvp-bracket/2v2?stream_friendly=1"
```

**Response Format:**

```json
{
  "character": {
    "name": "Leeroy",
    "realm": "Azralon",
    "realm_slug": "azralon"
  },
  "honor": {
    "level": 80,
    "honorable_kills": 15420
  },
  "ratings": {
    "2v2": {
      "rating": 1850,
      "won": 45,
      "lost": 32,
      "played": 77,
      "rank": 1250
    },
    "3v3": {
      "rating": 2100,
      "won": 68,
      "lost": 42,
      "played": 110,
      "rank": 450
    },
    "rbg": {
      "rating": 1950,
      "won": 25,
      "lost": 15,
      "played": 40,
      "rank": 890
    }
  },
  "last_updated": "2025-10-23T12:34:56.789Z"
}
```

**Classic MoP Response Format:**

```json
{
  "character": {
    "name": "Leeroy",
    "realm": "Azralon",
    "realm_slug": "azralon"
  },
  "honor": {
    "level": 80,
    "honorable_kills": 15420
  },
  "ratings": {
    "2v2": {
      "rating": 1850,
      "won": 45,
      "lost": 32,
      "played": 77,
      "rank": 1250
    },
    "3v3": {
      "rating": 2100,
      "won": 68,
      "lost": 42,
      "played": 110,
      "rank": 450
    },
    "rbg": {
      "rating": 1950,
      "won": 25,
      "lost": 15,
      "played": 40,
      "rank": 890
    }
  },
  "last_updated": "2025-10-23T12:34:56.789Z",
  "game_version": "classic-mop"
}
```

**Bracket Response Format:**

```json
{
  "character": {
    "name": "Leeroy",
    "realm": "Azralon",
    "realm_slug": "azralon"
  },
  "bracket": "2v2",
  "rating": 1850,
  "season": {
    "played": 77,
    "won": 45,
    "lost": 32,
    "win_rate": 58
  },
  "weekly": {
    "played": 12,
    "won": 8,
    "lost": 4,
    "win_rate": 67
  },
  "last_updated": "2025-10-23T12:34:56.789Z"
}
```

**Classic MoP Bracket Response Format:**

```json
{
  "character": {
    "name": "Leeroy",
    "realm": "Azralon",
    "realm_slug": "azralon"
  },
  "bracket": "2v2",
  "rating": 1850,
  "season": {
    "played": 77,
    "won": 45,
    "lost": 32,
    "win_rate": 58
  },
  "weekly": {
    "played": 12,
    "won": 8,
    "lost": 4,
    "win_rate": 67
  },
  "last_updated": "2025-10-23T12:34:56.789Z",
  "game_version": "classic-mop"
}
```

**Stream-Friendly Text Format:**

```
Leeroy - Azralon
Honor Level: 80 | HKs: 15420
Ratings: 2v2: 1850 | 3v3: 2100 | RBG: 1950
Updated: 10/23/2025, 12:34:56 PM
```

**Bracket Stream-Friendly Text Format:**

```
Leeroy - Azralon (2v2)
Rating: 1850
Season: 45-32 (77 games, 58% WR)
Weekly: 8-4 (12 games, 67% WR)
Updated: 10/23/2025, 12:34:56 PM
```

**Error Responses:**

```json
{
  "error": "Character not found"
}
```

```json
{
  "error": "Classic MoP character not found"
}
```

```json
{
  "error": "Character or bracket not found"
}
```

```json
{
  "error": "Invalid region. Must be one of: us, eu, kr, tw"
}
```

```json
{
  "error": "Invalid PvP bracket. Must be one of: 2v2, 3v3, rbg"
}
```

```json
{
  "error": "Invalid fields. Valid fields are: character, honor, ratings, last_updated"
}
```

```json
{
  "error": "Failed to fetch character data",
  "message": "Detailed error message"
}
```

## Rate Limiting

The Battle.net API has rate limits:
- 100 requests per second per IP address
- Token caching helps minimize unnecessary token requests
- Tokens are cached with a 60-second buffer before expiration

## Query Parameters Reference

### Global Parameters (Available on all endpoints)
- `region`: Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale`: Locale code (e.g., `en_US`, `en_GB`, `de_DE`, `fr_FR`) - defaults to `en_US`
- `fields`: Comma-separated list of fields to return
- `stream_friendly`: Set to `1` to return plain text format instead of JSON

### Field Filtering Examples
```bash
# Get only character info and ratings
curl "http://localhost:3000/character/azralon/leeroy?fields=character,ratings"

# Get only rating and season stats for a bracket
curl "http://localhost:3000/character/azralon/leeroy/pvp-bracket/2v2?fields=rating,season"
```

## Stream-Friendly Format

When `stream_friendly=1` is used, the API returns plain text optimized for:
- Streaming applications
- Command-line usage
- Simple text displays
- Overlay integrations

The format includes:
- Character name and realm
- Honor level and kills (for character endpoints)
- Current ratings (for character endpoints)
- Rating and win rates (for bracket endpoints)
- Human-readable timestamp

## Notes

- Character data updates when the character logs out of the game
- Realm names should be URL-encoded if they contain spaces or special characters
- Character names are case-insensitive but are converted to lowercase for API calls
- The `/character` endpoint is for retail WoW characters using `profile-{region}` namespace
- The `/classic-mop/character` endpoint is for WoW Classic MoP characters using `profile-classic-{region}` namespace
- Classic MoP uses different namespaces: `static-classic-{region}`, `dynamic-classic-{region}`, `profile-classic-{region}`
- Win rates are automatically calculated as percentages and rounded to whole numbers
- All timestamps are returned in ISO 8601 format (UTC)
- The API automatically handles token refresh and caching
- Field filtering is case-sensitive and must match exact field names

## Technology Stack

- **Runtime**: Bun
- **Framework**: Hono.js
- **Language**: TypeScript
- **API**: Battle.net World of Warcraft API

## Development

To run in development mode with hot reloading:

```sh
bun run dev
```

The server will automatically restart when you make changes to the source code.

## Project Structure

```
pvp-rank-api/
├── src/
│   └── index.ts          # Main application file with all endpoints
├── .env.example          # Environment variables template
├── package.json          # Dependencies and scripts
└── README.md            # This documentation
```

## Docker Deployment

### Building the Docker Image

```bash
docker build -t pvp-rank-api .
```

### Running the Container

```bash
# Run with environment variables
docker run -d \
  -p 3000:3000 \
  -e BATTLE_NET_CLIENT_ID=your_client_id \
  -e BATTLE_NET_CLIENT_SECRET=your_client_secret \
  -e BATTLE_NET_REGION=us \
  -e DEFAULT_LOCALE=en_US \
  --name pvp-rank-api \
  pvp-rank-api

# Test the container
curl http://localhost:3000/
```

### Quick Test

```bash
# Build and run with test credentials
docker build -t pvp-rank-api .
docker run -d -p 3000:3000 \
  -e BATTLE_NET_CLIENT_ID=test \
  -e BATTLE_NET_CLIENT_SECRET=test \
  --name pvp-rank-api-test \
  pvp-rank-api

# Check if it's running
curl http://localhost:3000/

# Stop test container
docker stop pvp-rank-api-test
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  pvp-rank-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - BATTLE_NET_CLIENT_ID=${BATTLE_NET_CLIENT_ID}
      - BATTLE_NET_CLIENT_SECRET=${BATTLE_NET_CLIENT_SECRET}
      - BATTLE_NET_REGION=${BATTLE_NET_REGION:-us}
      - DEFAULT_LOCALE=${DEFAULT_LOCALE:-en_US}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Run with Docker Compose:

```bash
# Create .env file with your credentials
echo "BATTLE_NET_CLIENT_ID=your_client_id" > .env
echo "BATTLE_NET_CLIENT_SECRET=your_client_secret" >> .env

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

### Docker Features

- **Multi-stage build**: Optimized image size with production dependencies only
- **Non-root user**: Enhanced security by running as non-privileged user
- **Health checks**: Automatic monitoring of API availability
- **Environment variables**: Secure configuration through environment variables
- **Alpine Linux**: Small and secure base image

## Key Implementation Details

- **Token Management**: Automatic Battle.net token caching with 60-second expiration buffer
- **Error Handling**: Comprehensive error responses with appropriate HTTP status codes
- **Validation**: Input validation for all parameters including regions, brackets, and fields
- **URL Encoding**: Automatic encoding of realm and character names for API compatibility
- **Response Formatting**: Support for both JSON and stream-friendly text output
- **Win Rate Calculation**: Automatic computation of win rates for season and weekly statistics
- **Docker Support**: Containerized deployment with health checks and security best practices
