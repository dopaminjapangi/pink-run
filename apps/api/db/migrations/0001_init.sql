BEGIN;
PRAGMA foreign_keys = ON;

-- Account table: stable UUID identifier + unique username login key.
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  username         TEXT NOT NULL UNIQUE,
  pin_hash         TEXT NOT NULL,
  failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     INTEGER NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at    TEXT NULL
);

-- One-row-per-user gameplay state.
CREATE TABLE IF NOT EXISTS game_state (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coin             INTEGER NOT NULL DEFAULT 10 CHECK (coin >= 0),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-row-per-user active run state.
CREATE TABLE IF NOT EXISTS run_state (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hearts           INTEGER NOT NULL DEFAULT 3 CHECK (hearts >= 0),
  player_lane      INTEGER NOT NULL DEFAULT 1 CHECK (player_lane BETWEEN 0 AND 2),
  combo            INTEGER NOT NULL DEFAULT 0 CHECK (combo >= 0),
  run_coin         INTEGER NOT NULL DEFAULT 0 CHECK (run_coin >= 0),
  remaining_sec    INTEGER NOT NULL DEFAULT 180 CHECK (remaining_sec >= 0),
  action_seq       INTEGER NOT NULL DEFAULT 0 CHECK (action_seq >= 0),
  started_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- Session token store (hash only, never raw token).
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  expires_at       INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

COMMIT;
