# WoW Classic PvP Rank API

A simple API service that fetches PvP ratings and ranks for World of Warcraft Classic characters using the Battle.net API.

## Features

- Get character PvP ratings for 2v2, 3v3, and RBG brackets
- Honor level and honorable kills information
- Support for multiple regions (US, EU, KR, TW)
- Token caching for optimal performance
- Error handling and validation

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

## API Endpoints

### GET `/`

Returns API information and available endpoints.

### GET `/character/:realm/:name`

Fetches PvP ratings and rank information for retail WoW characters.

**Parameters:**
- `realm` (path): Character realm name (e.g., "azralon", "tichondrius")
- `name` (path): Character name (e.g., "leeroy")

**Query Parameters:**
- `region` (optional): Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale` (optional): Locale code (e.g., `en_US`, `en_GB`) - defaults to `en_US`

### GET `/classic-mop/character/:realm/:name`

Fetches PvP ratings and rank information for WoW Classic MoP (Mists of Pandaria) characters using the `profile-classic-{region}` namespace.

**Parameters:**
- `realm` (path): Character realm name (e.g., "azralon", "tichondrius")
- `name` (path): Character name (e.g., "leeroy")

**Query Parameters:**
- `region` (optional): Battle.net region (`us`, `eu`, `kr`, `tw`) - defaults to `us`
- `locale` (optional): Locale code (e.g., `en_US`, `en_GB`) - defaults to `en_US`

**Example Requests:**

```bash
# Retail WoW character
curl http://localhost:3000/character/azralon/leeroy

# Retail WoW with region and locale
curl "http://localhost:3000/character/azralon/leeroy?region=us&locale=en_US"

# Retail WoW European realm
curl "http://localhost:3000/character/ragnaros/guldan?region=eu&locale=en_GB"

# Classic MoP character
curl http://localhost:3000/classic-mop/character/azralon/leeroy

# Classic MoP with region and locale
curl "http://localhost:3000/classic-mop/character/azralon/leeroy?region=us&locale=en_US"

# Classic MoP European realm
curl "http://localhost:3000/classic-mop/character/ragnaros/guldan?region=eu&locale=en_GB"
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

**Error Responses:**

```json
{
  "error": "Character not found"
}
```

```json
{
  "error": "Invalid region. Must be one of: us, eu, kr, tw"
}
```

## Rate Limiting

The Battle.net API has rate limits:
- 100 requests per second per IP address
- Token caching helps minimize unnecessary token requests

## Notes

- Character data updates when the character logs out of the game
- Realm names should be URL-encoded if they contain spaces or special characters
- Character names are case-insensitive
- The `/character` endpoint is for retail WoW characters using `profile-{region}` namespace
- The `/classic-mop/character` endpoint is for WoW Classic MoP characters using `profile-classic-{region}` namespace
- Classic MoP uses different namespaces: `static-classic-{region}`, `dynamic-classic-{region}`, `profile-classic-{region}`

## Development

To run in development mode with hot reloading:

```sh
bun run dev
```

The server will automatically restart when you make changes to the source code.
