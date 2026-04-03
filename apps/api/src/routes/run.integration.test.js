import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pink-run-api-run-test-"));
process.env.DB_PATH = path.join(tempRoot, "app.db");

const { createApp } = await import("../app.js");

function createApiClient(baseUrl) {
  async function call(pathname, options = {}, token = "") {
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // no body
    }

    return {
      status: response.status,
      body,
    };
  }

  return { call };
}

test("run API supports start/submit flow with basic validation", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server address is not available.");
    }

    const api = createApiClient(`http://127.0.0.1:${address.port}`);
    const username = `runner_${Date.now()}`;

    const register = await api.call("/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, pin: "1234" }),
    });

    assert.equal(register.status, 201);
    assert.ok(register.body?.accessToken);
    const token = register.body.accessToken;

    const submitWithoutStart = await api.call(
      "/v1/game/run/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivalMs: 1000,
          dodges: 3,
          hits: 3,
          coinEarned: 3,
          endedBy: "HEARTS",
        }),
      },
      token
    );
    assert.equal(submitWithoutStart.status, 409);
    assert.equal(submitWithoutStart.body?.code, "RUN_NOT_STARTED");

    const start = await api.call("/v1/game/run/start", { method: "POST" }, token);
    assert.equal(start.status, 200);
    assert.equal(start.body?.run?.initialHearts, 3);

    const badSubmit = await api.call(
      "/v1/game/run/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivalMs: 1000,
          dodges: 999,
          hits: 3,
          coinEarned: 3,
          endedBy: "HEARTS",
        }),
      },
      token
    );
    assert.equal(badSubmit.status, 409);
    assert.equal(badSubmit.body?.code, "DODGES_OUT_OF_RANGE");

    const goodSubmit = await api.call(
      "/v1/game/run/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivalMs: 1000,
          dodges: 3,
          hits: 3,
          coinEarned: 2,
          endedBy: "HEARTS",
        }),
      },
      token
    );
    assert.equal(goodSubmit.status, 200);
    assert.equal(goodSubmit.body?.end?.endedBy, "HEARTS");
    assert.equal(goodSubmit.body?.end?.settledCoin, 2);

    const runStateAfterSubmit = await api.call("/v1/game/run/state", { method: "GET" }, token);
    assert.equal(runStateAfterSubmit.status, 200);
    assert.equal(runStateAfterSubmit.body?.run, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
