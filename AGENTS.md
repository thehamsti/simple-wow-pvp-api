# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` boots the Hono app, wiring legacy handlers from `src/routes` and versioned logic in `src/v1`.
- `src/v1` splits responsibilities into `routes/`, `services/`, `utils/`, and `types.ts`; prefer adding new flows here.
- Shared helpers (`cache.ts`, `metrics.ts`, `utils.ts`) power token caching and transformations—keep cross-cutting logic isolated.
- Tests live in `tests/*.test.ts` mirroring `src`; playground scripts for manual checks sit under `scripts/`.

## Build, Test, and Development Commands
- `bun install` installs dependencies; rerun after lockfile changes.
- `bun run dev` starts the hot server on port 3000+, `bun start` launches the production entry point.
- `bun test` runs the `bun:test` suite; add `--watch` when iterating.
- `bun run scripts/v1-character.ts retail area-52 thiaba` (example) hits a running server; adjust arguments as needed.
- `bun run build` wraps `docker build -t pvp-rank-api .` for image creation.

## Coding Style & Naming Conventions
- TypeScript + Bun with ES modules and named exports by default.
- Two-space indentation, single quotes, and trailing commas in multiline structures match the repo style.
- Use `camelCase` for functions/variables, `PascalCase` for types, and `UPPER_SNAKE_CASE` for constants.
- Run your formatter (`bun format` or local Prettier) before committing; avoid sweeping formatting-only PRs.

## Testing Guidelines
- Create tests with `bun:test` helpers (`describe`, `it`, `expect`) and mirror source paths (`src/v1/services/foo.ts` → `tests/v1-services.test.ts`).
- Stub Battle.net calls and seed env vars via `process.env` to keep suites hermetic.
- Cover happy path, error mapping, and rate-limit branches; document intentional skips in PRs.
- Run `bun test` locally and include the output in review notes.

## Commit & Pull Request Guidelines
- Follow the short imperative history (`Delete cache file`, `Improve logging`); expand with a body when context is non-obvious.
- Keep each commit focused; separate feature work from refactors or dependency bumps.
- PRs should note what changed, how it was tested, linked tickets, and any API or env impacts.
- Provide sample responses or screenshots when you touch payload shapes so reviewers can validate behavior.

## Environment & Security Notes
- Copy `.env.example` to `.env` and supply Battle.net credentials; never commit secrets or `pvp_cache.db`.
- Sanitise logs before sharing externally and rotate credentials if secrets leak.
