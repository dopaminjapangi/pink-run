import db from "../db.js";
import { createSessionToken, createUuid, hashToken } from "./crypto.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSession(userId) {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const sessionId = createUuid();
  const expiresAt = Date.now() + SESSION_TTL_MS;

  db.prepare(
    `
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `
  ).run(sessionId, userId, tokenHash, expiresAt);

  return token;
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Missing bearer token.",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Invalid bearer token.",
    });
  }

  const tokenHash = hashToken(token);
  const now = Date.now();

  const session = db
    .prepare(
      `
        SELECT
          s.id AS session_id,
          s.user_id AS user_id,
          u.username AS username
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
      `
    )
    .get(tokenHash, now);

  if (!session) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Session is invalid or expired.",
    });
  }

  req.auth = {
    sessionId: session.session_id,
    userId: session.user_id,
    username: session.username,
    tokenHash,
  };

  return next();
}
