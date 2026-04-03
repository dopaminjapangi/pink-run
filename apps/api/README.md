# Pink Run API

Minimal backend for a vending-loop game.

## Why this shape

- Backend-first: auth and game state contract must be stable before frontend wiring.
- Username login: `username` is unique, but real identity key is UUID (`users.id`).
- Simple auth: 4-digit PIN, hashed with scrypt, no PIN reset flow.

## Run

From repository root:

```bash
npm run dev:api
```

Default port is `3200`. Frontend origin can be set with `FRONTEND_ORIGIN`.

## Endpoints

- `POST /v1/auth/register` `{ username, pin }`
- `POST /v1/auth/login` `{ username, pin }`
- `POST /v1/auth/logout` (Bearer token)
- `GET /v1/game/state` (Bearer token)
- `POST /v1/game/spin` (Bearer token)
- `GET /v1/game/run/state` (Bearer token)
- `POST /v1/game/run/start` (Bearer token)
- `POST /v1/game/run/submit` (Bearer token)
- `POST /v1/game/run/end` (Bearer token)

## Core game defaults

- Initial coin on register: `10`
- Spin cost: `1`
- Drop rates: `MISS 45 / COMMON 40 / RARE 13 / EPIC 2`
- Rewards: `MISS 0 / COMMON 1 / RARE 5 / EPIC 20`
- Endless submit validation:
  - `survivalMs` upper bound vs server elapsed time
  - `dodges` upper bound by survival duration
  - `coinEarned` upper bound by survival+dodges

## Security minimums

- PIN stored as hash (`salt:scryptHash`), never plaintext
- Login lock: 5 failed attempts => 10 minute temporary lock
- Session tokens are stored as SHA-256 hash

## Notes

- This project uses `node:sqlite` (built-in, experimental in Node 24.x).
- DB file path: `apps/api/data/app.db` (override with `DB_PATH`).
