import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dopamine-api-stage-test-"));
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

test("stage API supports start/submit and leaderboard", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server address is not available.");
    }

    const api = createApiClient(`http://127.0.0.1:${address.port}`);

    const register = await api.call("/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `heart_${Date.now()}`, pin: "1234" }),
    });

    assert.equal(register.status, 201);
    const token = register.body?.accessToken;
    assert.ok(token);

    const submitWithoutStart = await api.call(
      "/v1/game/stage/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: "nope",
          stageId: "meadow_1",
          heartsCollected: 1,
          starsLit: 1,
          maxCombo: 1,
          cleared: true,
          durationMs: 1000,
        }),
      },
      token
    );

    assert.equal(submitWithoutStart.status, 409);
    assert.equal(submitWithoutStart.body?.code, "RUN_NOT_STARTED");

    const start = await api.call(
      "/v1/game/stage/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: "meadow_1" }),
      },
      token
    );

    assert.equal(start.status, 200);
    assert.equal(start.body?.stageId, "meadow_1");
    assert.ok(start.body?.runId);

    const badSubmit = await api.call(
      "/v1/game/stage/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: start.body.runId,
          stageId: "meadow_1",
          heartsCollected: 999,
          starsLit: 1,
          maxCombo: 1,
          cleared: true,
          durationMs: 1000,
        }),
      },
      token
    );

    assert.equal(badSubmit.status, 400);
    assert.equal(badSubmit.body?.code, "HEARTS_OUT_OF_RANGE");

    const goodSubmit = await api.call(
      "/v1/game/stage/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: start.body.runId,
          stageId: "meadow_1",
          heartsCollected: 4,
          starsLit: 2,
          maxCombo: 5,
          cleared: true,
          durationMs: 1000,
        }),
      },
      token
    );

    assert.equal(goodSubmit.status, 200);
    assert.equal(goodSubmit.body?.progress?.totalHearts, 4);
    assert.equal(goodSubmit.body?.progress?.totalStarsLit, 2);
    assert.equal(goodSubmit.body?.progress?.bestCombo, 5);

    const leaderboard = await api.call("/v1/game/leaderboard?metric=hearts&limit=10", { method: "GET" }, token);
    assert.equal(leaderboard.status, 200);
    assert.equal(leaderboard.body?.metric, "hearts");
    assert.ok(Array.isArray(leaderboard.body?.entries));
    assert.equal(leaderboard.body.entries[0].value, 4);

    const state = await api.call("/v1/game/state", { method: "GET" }, token);
    assert.equal(state.status, 200);
    assert.equal(state.body?.progress?.totalHearts, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
