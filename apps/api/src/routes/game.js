import { Router } from "express";
import db, { runInTransaction } from "../db.js";
import { createUuid } from "../lib/crypto.js";
import { maxCoinForRun, maxDodgesForSurvivalMs, rewardCoinForTier, rollTier, spinCost } from "../lib/game.js";
import { sendError } from "../lib/http.js";
import { ensurePlayerProgress, selectGameStateWithProgress, selectPlayerProgress } from "../lib/progress.js";
import { requireAuth } from "../lib/session.js";
import { getStageConfig, STAGE_INITIAL_HEARTS } from "../lib/stages.js";

const RUN_INITIAL_HEARTS = 3;
const RUN_MAX_SERVER_TOLERANCE_MS = 5_000;
const STAGE_MAX_SERVER_TOLERANCE_MS = 5_000;
const LEADERBOARD_LIMIT_DEFAULT = 20;
const LEADERBOARD_LIMIT_MAX = 50;

function selectRunState(userId) {
  return db
    .prepare(
      `
        SELECT started_at AS startedAt
        FROM run_state
        WHERE user_id = ?
      `
    )
    .get(userId);
}

function selectStageRunState(userId) {
  return db
    .prepare(
      `
        SELECT run_id AS runId, stage_id AS stageId, started_at AS startedAt, status
        FROM stage_run_state
        WHERE user_id = ?
      `
    )
    .get(userId);
}

function parseRunSubmitInput(body) {
  const survivalMs = Number(body?.survivalMs);
  const hits = Number(body?.hits);
  const dodges = Number(body?.dodges);
  const coinEarned = Number(body?.coinEarned);
  const endedBy = typeof body?.endedBy === "string" ? body.endedBy : "";

  if (!Number.isInteger(survivalMs) || survivalMs < 0) {
    return {
      ok: false,
      code: "INVALID_SURVIVAL_MS",
      message: "survivalMs must be a non-negative integer.",
    };
  }

  if (!Number.isInteger(hits) || hits < RUN_INITIAL_HEARTS) {
    return {
      ok: false,
      code: "INVALID_HITS",
      message: `hits must be an integer and at least ${RUN_INITIAL_HEARTS}.`,
    };
  }

  if (!Number.isInteger(dodges) || dodges < 0) {
    return {
      ok: false,
      code: "INVALID_DODGES",
      message: "dodges must be a non-negative integer.",
    };
  }

  if (!Number.isInteger(coinEarned) || coinEarned < 0) {
    return {
      ok: false,
      code: "INVALID_COIN_EARNED",
      message: "coinEarned must be a non-negative integer.",
    };
  }

  if (endedBy !== "HEARTS") {
    return {
      ok: false,
      code: "INVALID_END_REASON",
      message: "endedBy must be HEARTS for endless mode submission.",
    };
  }

  return {
    ok: true,
    survivalMs,
    hits,
    dodges,
    coinEarned,
    endedBy,
  };
}

function parseStageStartInput(body) {
  const stageId = typeof body?.stageId === "string" ? body.stageId.trim() : "";
  if (!stageId) {
    return {
      ok: false,
      code: "INVALID_STAGE_ID",
      message: "stageId is required.",
    };
  }

  const stage = getStageConfig(stageId);
  if (!stage) {
    return {
      ok: false,
      code: "STAGE_NOT_FOUND",
      message: "Unknown stageId.",
    };
  }

  return {
    ok: true,
    stage,
  };
}

function parseStageSubmitInput(body) {
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  const stageId = typeof body?.stageId === "string" ? body.stageId.trim() : "";
  const heartsCollected = Number(body?.heartsCollected);
  const starsLit = Number(body?.starsLit);
  const maxCombo = Number(body?.maxCombo);
  const durationMs = Number(body?.durationMs);
  const cleared = typeof body?.cleared === "boolean" ? body.cleared : null;

  if (!runId) {
    return { ok: false, code: "INVALID_RUN_ID", message: "runId is required." };
  }

  const stage = getStageConfig(stageId);
  if (!stage) {
    return { ok: false, code: "STAGE_NOT_FOUND", message: "Unknown stageId." };
  }

  if (!Number.isInteger(heartsCollected) || heartsCollected < 0) {
    return {
      ok: false,
      code: "INVALID_HEARTS_COLLECTED",
      message: "heartsCollected must be a non-negative integer.",
    };
  }

  if (!Number.isInteger(starsLit) || starsLit < 0) {
    return {
      ok: false,
      code: "INVALID_STARS_LIT",
      message: "starsLit must be a non-negative integer.",
    };
  }

  if (!Number.isInteger(maxCombo) || maxCombo < 0) {
    return {
      ok: false,
      code: "INVALID_MAX_COMBO",
      message: "maxCombo must be a non-negative integer.",
    };
  }

  if (!Number.isInteger(durationMs) || durationMs < 0) {
    return {
      ok: false,
      code: "INVALID_DURATION_MS",
      message: "durationMs must be a non-negative integer.",
    };
  }

  if (cleared === null) {
    return {
      ok: false,
      code: "INVALID_CLEARED",
      message: "cleared must be a boolean.",
    };
  }

  if (heartsCollected > stage.maxHearts) {
    return {
      ok: false,
      code: "HEARTS_OUT_OF_RANGE",
      message: "heartsCollected exceeds stage maxHearts.",
    };
  }

  if (starsLit > stage.maxStars) {
    return {
      ok: false,
      code: "STARS_OUT_OF_RANGE",
      message: "starsLit exceeds stage maxStars.",
    };
  }

  if (maxCombo > stage.maxComboCap) {
    return {
      ok: false,
      code: "COMBO_OUT_OF_RANGE",
      message: "maxCombo exceeds stage maxComboCap.",
    };
  }

  return {
    ok: true,
    runId,
    stage,
    heartsCollected,
    starsLit,
    maxCombo,
    durationMs,
    cleared,
  };
}

function settleRunByCoin(userId, settledCoin, endedBy, meta) {
  const state = selectGameStateWithProgress(userId);
  if (!state) {
    throw new Error("GAME_STATE_NOT_FOUND");
  }

  const nextCoin = state.coin + settledCoin;
  runInTransaction(() => {
    db.prepare(
      `
        UPDATE game_state
        SET coin = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `
    ).run(nextCoin, userId);

    db.prepare("DELETE FROM run_state WHERE user_id = ?").run(userId);
  });

  return {
    state: {
      ...state,
      coin: nextCoin,
    },
    end: {
      endedBy,
      settledCoin,
      ...meta,
    },
  };
}

function leaderboardOrderBy(metric) {
  if (metric === "hearts") return "total_hearts";
  if (metric === "stars") return "total_stars_lit";
  return "best_combo";
}

export function createGameRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/state", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }
      return res.status(200).json(state);
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to fetch game state.");
    }
  });

  router.post("/stage/start", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }

      const parsed = parseStageStartInput(req.body);
      if (!parsed.ok) {
        return sendError(res, 400, parsed.code, parsed.message);
      }

      const runId = createUuid();
      const nowMs = Date.now();

      runInTransaction(() => {
        ensurePlayerProgress(req.auth.userId);
        db.prepare("DELETE FROM stage_run_state WHERE user_id = ?").run(req.auth.userId);
        db.prepare(
          `
            INSERT INTO stage_run_state (
              run_id,
              user_id,
              stage_id,
              started_at,
              status,
              updated_at
            )
            VALUES (?, ?, ?, ?, 'ACTIVE', ?)
          `
        ).run(runId, req.auth.userId, parsed.stage.id, nowMs, nowMs);
      });

      return res.status(200).json({
        runId,
        stageId: parsed.stage.id,
        startedAt: nowMs,
        initialHearts: STAGE_INITIAL_HEARTS,
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to start stage.");
    }
  });

  router.post("/stage/submit", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }

      const run = selectStageRunState(req.auth.userId);
      if (!run) {
        return sendError(res, 409, "RUN_NOT_STARTED", "Stage run has not started.");
      }

      const parsed = parseStageSubmitInput(req.body);
      if (!parsed.ok) {
        return sendError(res, 400, parsed.code, parsed.message);
      }

      if (run.runId !== parsed.runId || run.stageId !== parsed.stage.id) {
        return sendError(res, 409, "RUN_MISMATCH", "runId or stageId does not match active run.");
      }

      const nowMs = Date.now();
      const serverElapsedMs = Math.max(0, nowMs - run.startedAt);
      if (parsed.durationMs > serverElapsedMs + STAGE_MAX_SERVER_TOLERANCE_MS) {
        return sendError(res, 409, "DURATION_OUT_OF_RANGE", "durationMs exceeds server-tracked elapsed time.");
      }

      runInTransaction(() => {
        db.prepare(
          `
            UPDATE player_progress
            SET
              total_hearts = total_hearts + ?,
              total_stars_lit = total_stars_lit + ?,
              best_combo = CASE WHEN best_combo > ? THEN best_combo ELSE ? END,
              updated_at = datetime('now')
            WHERE user_id = ?
          `
        ).run(parsed.heartsCollected, parsed.starsLit, parsed.maxCombo, parsed.maxCombo, req.auth.userId);

        db.prepare(
          `
            INSERT INTO stage_result_log (
              run_id,
              user_id,
              stage_id,
              hearts_collected,
              stars_lit,
              max_combo,
              cleared,
              duration_ms,
              submitted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          parsed.runId,
          req.auth.userId,
          parsed.stage.id,
          parsed.heartsCollected,
          parsed.starsLit,
          parsed.maxCombo,
          parsed.cleared ? 1 : 0,
          parsed.durationMs,
          nowMs
        );

        db.prepare("DELETE FROM stage_run_state WHERE user_id = ?").run(req.auth.userId);
      });

      return res.status(200).json({
        progress: selectPlayerProgress(req.auth.userId),
        stageResult: {
          runId: parsed.runId,
          stageId: parsed.stage.id,
          heartsCollected: parsed.heartsCollected,
          starsLit: parsed.starsLit,
          maxCombo: parsed.maxCombo,
          cleared: parsed.cleared,
          durationMs: parsed.durationMs,
          submittedAt: nowMs,
        },
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to submit stage result.");
    }
  });

  router.get("/leaderboard", (req, res) => {
    try {
      const metric = typeof req.query.metric === "string" ? req.query.metric : "hearts";
      if (!["hearts", "stars", "combo"].includes(metric)) {
        return sendError(res, 400, "INVALID_METRIC", "metric must be one of hearts|stars|combo.");
      }

      const parsedLimit = Number(req.query.limit);
      const limit = Number.isInteger(parsedLimit)
        ? Math.min(Math.max(1, parsedLimit), LEADERBOARD_LIMIT_MAX)
        : LEADERBOARD_LIMIT_DEFAULT;

      const orderColumn = leaderboardOrderBy(metric);
      const rows = db
        .prepare(
          `
            SELECT
              users.username AS username,
              player_progress.${orderColumn} AS value,
              player_progress.updated_at AS updatedAt
            FROM player_progress
            INNER JOIN users ON users.id = player_progress.user_id
            ORDER BY value DESC, updatedAt ASC, username ASC
            LIMIT ?
          `
        )
        .all(limit);

      const entries = rows.map((row, index) => ({
        rank: index + 1,
        username: row.username,
        value: row.value,
      }));

      return res.status(200).json({
        metric,
        limit,
        entries,
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to fetch leaderboard.");
    }
  });

  router.get("/run/state", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }

      const run = selectRunState(req.auth.userId);
      if (!run) {
        return res.status(200).json({ state, run: null });
      }

      return res.status(200).json({
        state,
        run: {
          startedAt: run.startedAt,
          initialHearts: RUN_INITIAL_HEARTS,
        },
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to fetch run state.");
    }
  });

  // Deprecated: kept for one version for backward compatibility.
  router.post("/run/start", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }

      const hadPrevious = Boolean(selectRunState(req.auth.userId));
      const nowMs = Date.now();

      runInTransaction(() => {
        db.prepare("DELETE FROM run_state WHERE user_id = ?").run(req.auth.userId);
        db.prepare(
          `
            INSERT INTO run_state (
              user_id,
              hearts,
              player_lane,
              combo,
              run_coin,
              remaining_sec,
              action_seq,
              started_at,
              updated_at
            )
            VALUES (?, ?, 1, 0, 0, 0, 0, ?, ?)
          `
        ).run(req.auth.userId, RUN_INITIAL_HEARTS, nowMs, nowMs);
      });

      return res.status(200).json({
        state,
        run: {
          startedAt: nowMs,
          initialHearts: RUN_INITIAL_HEARTS,
        },
        resumed: false,
        replacedPrevious: hadPrevious,
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to start run.");
    }
  });

  // Deprecated: kept for one version for backward compatibility.
  router.post("/run/submit", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }

      const run = selectRunState(req.auth.userId);
      if (!run) {
        return sendError(res, 409, "RUN_NOT_STARTED", "Run has not started.");
      }

      const parsed = parseRunSubmitInput(req.body);
      if (!parsed.ok) {
        return sendError(res, 400, parsed.code, parsed.message);
      }

      const nowMs = Date.now();
      const serverElapsedMs = Math.max(0, nowMs - run.startedAt);
      if (parsed.survivalMs > serverElapsedMs + RUN_MAX_SERVER_TOLERANCE_MS) {
        return sendError(res, 409, "SURVIVAL_OUT_OF_RANGE", "survivalMs exceeds server-tracked elapsed time.");
      }

      const maxDodges = maxDodgesForSurvivalMs(parsed.survivalMs);
      if (parsed.dodges > maxDodges) {
        return sendError(res, 409, "DODGES_OUT_OF_RANGE", "dodges exceeds allowed range for submitted survivalMs.");
      }

      const maxCoin = maxCoinForRun(parsed.survivalMs, parsed.dodges);
      if (parsed.coinEarned > maxCoin) {
        return sendError(res, 409, "COIN_OUT_OF_RANGE", "coinEarned exceeds allowed range for submitted run.");
      }

      const settled = settleRunByCoin(req.auth.userId, parsed.coinEarned, parsed.endedBy, {
        survivalMs: parsed.survivalMs,
        dodges: parsed.dodges,
        hits: parsed.hits,
        validatedMaxCoin: maxCoin,
      });

      return res.status(200).json({
        state: settled.state,
        end: settled.end,
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to submit run.");
    }
  });

  // Deprecated: kept for one version for backward compatibility.
  router.post("/run/end", (req, res) => {
    try {
      const run = selectRunState(req.auth.userId);
      if (!run) {
        return sendError(res, 409, "RUN_NOT_STARTED", "Run has not started.");
      }

      const nowMs = Date.now();
      const survivalMs = Math.max(0, nowMs - run.startedAt);
      const settled = settleRunByCoin(req.auth.userId, 0, "MANUAL", {
        survivalMs,
        dodges: 0,
        hits: 0,
        validatedMaxCoin: 0,
      });

      return res.status(200).json({
        state: settled.state,
        end: settled.end,
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to end run.");
    }
  });

  router.post("/spin", (req, res) => {
    try {
      const state = selectGameStateWithProgress(req.auth.userId);
      if (!state) {
        return sendError(res, 404, "STATE_NOT_FOUND", "Game state not found.");
      }

      const cost = spinCost();
      if (state.coin < cost) {
        return sendError(res, 409, "NOT_ENOUGH_COIN", "Not enough coin to spin.");
      }

      const tier = rollTier();
      const rewardCoin = rewardCoinForTier(tier);
      const nextCoin = state.coin - cost + rewardCoin;

      db.prepare(
        `
          UPDATE game_state
          SET coin = ?, updated_at = datetime('now')
          WHERE user_id = ?
        `
      ).run(nextCoin, req.auth.userId);

      return res.status(200).json({
        tier,
        rewardCoin,
        spinCost: cost,
        state: {
          ...state,
          coin: nextCoin,
        },
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to spin.");
    }
  });

  return router;
}
