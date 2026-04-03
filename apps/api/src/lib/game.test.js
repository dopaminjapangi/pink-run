import assert from "node:assert/strict";
import test from "node:test";
import { maxCoinForRun, maxDodgesForSurvivalMs, rollTier, spinCost } from "./game.js";

test("spinCost is fixed at 1", () => {
  assert.equal(spinCost(), 1);
});

test("maxDodgesForSurvivalMs enforces realistic upper bound", () => {
  assert.equal(maxDodgesForSurvivalMs(0), 30);
  assert.equal(maxDodgesForSurvivalMs(5000), 50);
});

test("maxCoinForRun scales with survival and dodges", () => {
  const low = maxCoinForRun(10_000, 12);
  const high = maxCoinForRun(20_000, 20);
  assert.ok(high > low);
  assert.ok(low > 0);
});

test("rollTier returns only valid tiers", () => {
  const allowed = new Set(["MISS", "COMMON", "RARE", "EPIC"]);
  for (let i = 0; i < 200; i += 1) {
    assert.equal(allowed.has(rollTier()), true);
  }
});
