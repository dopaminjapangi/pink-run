const USERNAME_REGEX = /^[A-Za-z0-9_]{3,24}$/;
const PIN_REGEX = /^\d{4}$/;

export function validateAuthInput(body) {
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      code: "INVALID_USERNAME",
      message: "username must be 3-24 chars of letters, numbers, or underscore.",
    };
  }

  if (!PIN_REGEX.test(pin)) {
    return {
      ok: false,
      code: "INVALID_PIN",
      message: "pin must be exactly 4 digits.",
    };
  }

  return { ok: true, username, pin };
}
