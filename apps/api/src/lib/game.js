const BASE_DROP_RATE = {
  miss: 45,
  common: 40,
  rare: 13,
  epic: 2,
};

const REWARD_BY_TIER = {
  MISS: 0,
  COMMON: 1,
  RARE: 5,
  EPIC: 20,
};

const BASE_SPIN_COST = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function rollTier() {
  const roll = Math.random() * 100;

  if (roll < BASE_DROP_RATE.miss) {
    return "MISS";
  }

  if (roll < BASE_DROP_RATE.miss + BASE_DROP_RATE.common) {
    return "COMMON";
  }

  if (roll < BASE_DROP_RATE.miss + BASE_DROP_RATE.common + BASE_DROP_RATE.rare) {
    return "RARE";
  }

  return "EPIC";
}

export function rewardCoinForTier(tier) {
  return REWARD_BY_TIER[tier] ?? 0;
}

export function spinCost() {
  return BASE_SPIN_COST;
}

export function maxDodgesForSurvivalMs(survivalMs) {
  const normalizedSurvival = Math.max(0, Math.floor(Number(survivalMs) || 0));
  return Math.floor(normalizedSurvival / 250) + 30;
}

export function maxCoinForRun(survivalMs, dodges) {
  const safeSurvival = Math.max(0, Math.floor(Number(survivalMs) || 0));
  const safeDodges = Math.max(0, Math.floor(Number(dodges) || 0));

  const timeBase = Math.floor(safeSurvival / 800);
  const dodgeBase = safeDodges * 2;
  const tolerance = 20;

  return clamp(timeBase + dodgeBase + tolerance, 0, 1_000_000);
}
