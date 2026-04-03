export const STAGE_INITIAL_HEARTS = 3;

export const STAGE_CATALOG = {
  meadow_1: {
    id: "meadow_1",
    name: "Sparkle Meadow",
    maxHearts: 30,
    maxStars: 5,
    maxComboCap: 25,
  },
  meadow_2: {
    id: "meadow_2",
    name: "Twinkle Bridge",
    maxHearts: 40,
    maxStars: 6,
    maxComboCap: 30,
  },
  meadow_3: {
    id: "meadow_3",
    name: "Rainbow Hill",
    maxHearts: 50,
    maxStars: 7,
    maxComboCap: 35,
  },
};

export function getStageConfig(stageId) {
  if (typeof stageId !== "string") {
    return null;
  }
  return STAGE_CATALOG[stageId] || null;
}
