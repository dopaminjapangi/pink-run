BEGIN;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS player_progress (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_hearts     INTEGER NOT NULL DEFAULT 0 CHECK (total_hearts >= 0),
  total_stars_lit  INTEGER NOT NULL DEFAULT 0 CHECK (total_stars_lit >= 0),
  best_combo       INTEGER NOT NULL DEFAULT 0 CHECK (best_combo >= 0),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stage_run_state (
  run_id           TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stage_id         TEXT NOT NULL,
  started_at       INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUBMITTED', 'ABORTED')),
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_result_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           TEXT NOT NULL UNIQUE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id         TEXT NOT NULL,
  hearts_collected INTEGER NOT NULL CHECK (hearts_collected >= 0),
  stars_lit        INTEGER NOT NULL CHECK (stars_lit >= 0),
  max_combo        INTEGER NOT NULL CHECK (max_combo >= 0),
  cleared          INTEGER NOT NULL CHECK (cleared IN (0, 1)),
  duration_ms      INTEGER NOT NULL CHECK (duration_ms >= 0),
  submitted_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_progress_updated_at ON player_progress(updated_at);
CREATE INDEX IF NOT EXISTS idx_stage_result_user_id ON stage_result_log(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_result_submitted_at ON stage_result_log(submitted_at);

COMMIT;
