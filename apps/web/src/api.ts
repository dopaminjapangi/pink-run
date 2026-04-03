import type {
  ApiError,
  AuthInput,
  AuthSuccess,
  GameState,
  LeaderboardMetric,
  LeaderboardResponse,
  StageStartInput,
  StageStartResponse,
  StageSubmitInput,
  StageSubmitResponse,
} from "@pink-run/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    let errorBody: ApiError = { code: "UNKNOWN", message: "Request failed." };
    try {
      errorBody = (await response.json()) as ApiError;
    } catch {
      // Keep fallback error body for non-json responses.
    }
    throw new Error(errorBody.message || "Request failed.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function register(input: AuthInput) {
  return request<AuthSuccess>("/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function login(input: AuthInput) {
  return request<AuthSuccess>("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function logout(accessToken: string) {
  return request<void>("/v1/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getState(accessToken: string) {
  return request<GameState>("/v1/game/state", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function startStage(accessToken: string, input: StageStartInput) {
  return request<StageStartResponse>("/v1/game/stage/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function submitStage(accessToken: string, input: StageSubmitInput) {
  return request<StageSubmitResponse>("/v1/game/stage/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function getLeaderboard(accessToken: string, metric: LeaderboardMetric, limit = 20) {
  const query = new URLSearchParams({ metric, limit: String(limit) });
  return request<LeaderboardResponse>(`/v1/game/leaderboard?${query.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
