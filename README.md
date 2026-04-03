# Pink Run Monorepo

Simple run-loop game in monorepo form.

## Structure

- `apps/api`: Express + SQLite API
- `apps/web`: React + Vite UI
- `packages/contracts`: shared TypeScript contracts

## Run

```bash
npm install
npm run dev
```

- API: `http://localhost:3200`
- Web: `http://localhost:5173`

## Docker (API + Web)

```bash
docker compose up --build
```

- Web: `http://localhost:8080`
- API: `http://localhost:3200`

`docker-compose.yml` defaults:

- `VITE_API_BASE_URL=http://localhost:3200`
- `FRONTEND_ORIGIN=http://localhost:8080`
- `DB_PATH=/data/app.db` (persisted by Docker volume `api_data`)

## Why monorepo

- API and UI version together, so contract drift is easier to control.
- Shared `@pink-run/contracts` types reduce integration mistakes.
