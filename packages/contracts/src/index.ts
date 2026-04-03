export type Tier = "MISS" | "COMMON" | "RARE" | "EPIC";
export type RunEndReason = "MANUAL" | "HEARTS" | "TIMEOUT";

export interface AuthInput {
  username: string;
  pin: string;
}

export interface UserInfo {
  id: string;
  username: string;
}

export interface PlayerProgress {
  totalHearts: number;
  totalStarsLit: number;
  bestCombo: number;
  updatedAt: string;
}

export interface GameState {
  coin: number;
  progress: PlayerProgress;
}

export interface AuthSuccess {
  accessToken: string;
  user: UserInfo;
  state: GameState;
}

export interface SpinResponse {
  tier: Tier;
  rewardCoin: number;
  spinCost: number;
  state: GameState;
}

export interface RunSession {
  startedAt: number;
  initialHearts: number;
}

export interface RunSummary {
  endedBy: RunEndReason;
  settledCoin: number;
  survivalMs: number;
  dodges: number;
  hits: number;
  validatedMaxCoin: number;
}

export interface RunStateResponse {
  state: GameState;
  run: RunSession | null;
}

export interface RunStartResponse {
  state: GameState;
  run: RunSession;
  resumed: boolean;
  replacedPrevious: boolean;
}

export interface RunSubmitInput {
  survivalMs: number;
  dodges: number;
  hits: number;
  coinEarned: number;
  endedBy: "HEARTS";
}

export interface RunSubmitResponse {
  state: GameState;
  end: RunSummary;
}

export interface RunEndResponse {
  state: GameState;
  end: RunSummary;
}

export interface StageStartInput {
  stageId: string;
}

export interface StageStartResponse {
  runId: string;
  stageId: string;
  startedAt: number;
  initialHearts: number;
}

export interface StageSubmitInput {
  runId: string;
  stageId: string;
  heartsCollected: number;
  starsLit: number;
  maxCombo: number;
  cleared: boolean;
  durationMs: number;
}

export interface StageResult {
  runId: string;
  stageId: string;
  heartsCollected: number;
  starsLit: number;
  maxCombo: number;
  cleared: boolean;
  durationMs: number;
  submittedAt: number;
}

export interface StageSubmitResponse {
  progress: PlayerProgress;
  stageResult: StageResult;
}

export type LeaderboardMetric = "hearts" | "stars" | "combo";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  value: number;
}

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  limit: number;
  entries: LeaderboardEntry[];
}

export interface ApiError {
  code: string;
  message: string;
}
