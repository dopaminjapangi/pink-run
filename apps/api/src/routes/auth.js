import { Router } from "express";
import db, { runInTransaction } from "../db.js";
import { createUuid, hashPin, verifyPin } from "../lib/crypto.js";
import { sendError } from "../lib/http.js";
import { ensurePlayerProgress, selectGameStateWithProgress } from "../lib/progress.js";
import { createSession, requireAuth } from "../lib/session.js";
import { validateAuthInput } from "../lib/validators.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;
const INITIAL_COIN = 10;

export function createAuthRouter() {
  const router = Router();

  router.post("/register", (req, res) => {
    try {
      const validation = validateAuthInput(req.body);
      if (!validation.ok) {
        return sendError(res, 400, validation.code, validation.message);
      }

      const { username, pin } = validation;
      const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
      if (existing) {
        return sendError(res, 409, "USERNAME_TAKEN", "Username already exists.");
      }

      const userId = createUuid();
      const pinHash = hashPin(pin);

      runInTransaction(() => {
        db.prepare(
          `
            INSERT INTO users (id, username, pin_hash)
            VALUES (?, ?, ?)
          `
        ).run(userId, username, pinHash);

        db.prepare(
          `
            INSERT INTO game_state (user_id, coin)
            VALUES (?, ?)
          `
        ).run(userId, INITIAL_COIN);

        ensurePlayerProgress(userId);
      });

      const accessToken = createSession(userId);
      const state = selectGameStateWithProgress(userId);

      return res.status(201).json({
        accessToken,
        user: { id: userId, username },
        state,
      });
    } catch (error) {
      if (String(error?.message).includes("UNIQUE constraint failed")) {
        return sendError(res, 409, "USERNAME_TAKEN", "Username already exists.");
      }
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to register user.");
    }
  });

  router.post("/login", (req, res) => {
    try {
      const validation = validateAuthInput(req.body);
      if (!validation.ok) {
        return sendError(res, 400, validation.code, validation.message);
      }

      const { username, pin } = validation;
      const user = db
        .prepare(
          `
            SELECT id, username, pin_hash, failed_attempts, locked_until
            FROM users
            WHERE username = ?
          `
        )
        .get(username);

      if (!user) {
        return sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or pin.");
      }

      const now = Date.now();
      if (user.locked_until && user.locked_until > now) {
        return sendError(res, 423, "ACCOUNT_LOCKED", "Account is temporarily locked.");
      }

      const isPinValid = verifyPin(pin, user.pin_hash);
      if (!isPinValid) {
        const failedAttempts = (user.failed_attempts ?? 0) + 1;
        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          db.prepare(
            `
              UPDATE users
              SET failed_attempts = 0, locked_until = ?
              WHERE id = ?
            `
          ).run(now + LOCKOUT_MS, user.id);

          return sendError(res, 423, "ACCOUNT_LOCKED", "Too many failed attempts.");
        }

        db.prepare(
          `
            UPDATE users
            SET failed_attempts = ?, locked_until = NULL
            WHERE id = ?
          `
        ).run(failedAttempts, user.id);

        return sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or pin.");
      }

      db.prepare(
        `
          UPDATE users
          SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now')
          WHERE id = ?
        `
      ).run(user.id);

      ensurePlayerProgress(user.id);

      const accessToken = createSession(user.id);
      const state = selectGameStateWithProgress(user.id);

      return res.status(200).json({
        accessToken,
        user: { id: user.id, username: user.username },
        state,
      });
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to login.");
    }
  });

  router.post("/logout", requireAuth, (req, res) => {
    try {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(req.auth.sessionId);
      return res.status(204).send();
    } catch {
      return sendError(res, 500, "INTERNAL_ERROR", "Failed to logout.");
    }
  });

  return router;
}
