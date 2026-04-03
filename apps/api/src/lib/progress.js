import db from "../db.js";

export function ensurePlayerProgress(userId) {
  db.prepare(
    `
      INSERT INTO player_progress (user_id)
      VALUES (?)
      ON CONFLICT(user_id) DO NOTHING
    `
  ).run(userId);
}

export function selectPlayerProgress(userId) {
  ensurePlayerProgress(userId);

  return db
    .prepare(
      `
        SELECT
          total_hearts AS totalHearts,
          total_stars_lit AS totalStarsLit,
          best_combo AS bestCombo,
          updated_at AS updatedAt
        FROM player_progress
        WHERE user_id = ?
      `
    )
    .get(userId);
}

export function selectGameStateWithProgress(userId) {
  const state = db
    .prepare(
      `
        SELECT coin
        FROM game_state
        WHERE user_id = ?
      `
    )
    .get(userId);

  if (!state) {
    return null;
  }

  return {
    ...state,
    progress: selectPlayerProgress(userId),
  };
}
