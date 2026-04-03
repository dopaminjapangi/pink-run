import crypto from "node:crypto";

const PIN_KEY_LENGTH = 64;

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, PIN_KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPin(pin, storedPinHash) {
  const [salt, expectedHex] = (storedPinHash || "").split(":");
  if (!salt || !expectedHex) {
    return false;
  }

  const actualHex = crypto.scryptSync(pin, salt, PIN_KEY_LENGTH).toString("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

export function createUuid() {
  return crypto.randomUUID();
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
