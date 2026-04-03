import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type {
  AuthInput,
  LeaderboardEntry,
  LeaderboardMetric,
  PlayerProgress,
  StageStartResponse,
  StageSubmitInput,
} from "@pink-run/contracts";
import {
  getLeaderboard,
  getState,
  login,
  logout,
  register,
  startStage,
  submitStage,
} from "./api";
import type { GameOverSnapshot, RuntimeSnapshot } from "./game/PhaserRunCanvas";

const PhaserRunCanvas = lazy(() =>
  import("./game/PhaserRunCanvas").then((module) => ({
    default: module.PhaserRunCanvas,
  })),
);

const TOKEN_STORAGE_KEY = "pink-run.accessToken";
const USERNAME_STORAGE_KEY = "pink-run.username";
const PIN_REGEX = /^\d{4}$/;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,24}$/;

interface AuthSession {
  token: string;
  username: string;
}

interface LeaderboardState {
  metric: LeaderboardMetric;
  entries: LeaderboardEntry[];
}

const METRIC_LABEL: Record<LeaderboardMetric, string> = {
  hearts: "하트",
  stars: "별",
  combo: "콤보",
};

const INITIAL_RUNTIME: RuntimeSnapshot = {
  lane: 1,
  heartsLeft: 3,
  heartsCollected: 0,
  starsLit: 0,
  currentCombo: 0,
  maxCombo: 0,
  durationMs: 0,
};

function loadSession(): AuthSession | null {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  const username = localStorage.getItem(USERNAME_STORAGE_KEY) || "";
  if (!token || !username) {
    return null;
  }
  return { token, username };
}

function saveSession(session: AuthSession) {
  localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
  localStorage.setItem(USERNAME_STORAGE_KEY, session.username);
}

function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USERNAME_STORAGE_KEY);
}

export default function App() {
  const [authMode, setAuthMode] = useState<"login" | "join">("login");
  const [usernameInput, setUsernameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [session, setSession] = useState<AuthSession | null>(loadSession());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "하트를 모아 별을 밝히는 모험을 시작해보세요.",
  );
  const [progress, setProgress] = useState<PlayerProgress | null>(null);
  const [activeStage, setActiveStage] = useState<StageStartResponse | null>(
    null,
  );
  const [runtime, setRuntime] = useState<RuntimeSnapshot>(INITIAL_RUNTIME);
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardState>({
    metric: "hearts",
    entries: [],
  });

  const canAuthSubmit = useMemo(() => {
    return (
      USERNAME_REGEX.test(usernameInput.trim()) &&
      PIN_REGEX.test(pinInput.trim())
    );
  }, [usernameInput, pinInput]);

  const isPlaying = Boolean(activeStage);
  const heartsLeft = Math.max(0, Math.min(3, runtime.heartsLeft));
  const leaderboardPreview = leaderboard.entries.slice(0, 3);

  useEffect(() => {
    if (!session) return;
    void refreshStateAndBoard(session.token);
  }, [session]);

  useEffect(() => {
    if (!leaderboardOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLeaderboardOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [leaderboardOpen]);

  async function refreshStateAndBoard(
    token: string,
    metric: LeaderboardMetric = leaderboard.metric,
  ) {
    const [state, board] = await Promise.all([
      getState(token),
      getLeaderboard(token, metric, 20),
    ]);
    setProgress(state.progress);
    setLeaderboard({ metric: board.metric, entries: board.entries });
  }

  async function handleAuth(mode: "login" | "join") {
    if (busy) return;
    setBusy(true);
    try {
      const payload: AuthInput = {
        username: usernameInput.trim(),
        pin: pinInput.trim(),
      };
      const response =
        mode === "login" ? await login(payload) : await register(payload);
      const nextSession = {
        token: response.accessToken,
        username: response.user.username,
      };
      saveSession(nextSession);
      setSession(nextSession);
      setProgress(response.state.progress);
      setPinInput("");
      const board = await getLeaderboard(
        nextSession.token,
        leaderboard.metric,
        20,
      );
      setLeaderboard({ metric: board.metric, entries: board.entries });
      setMessage(
        mode === "login" ? "로그인되었습니다." : "가입이 완료되었습니다.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "인증 요청에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStartStage(stageId: string) {
    if (!session || busy) return;
    setBusy(true);
    try {
      const started = await startStage(session.token, { stageId });
      setActiveStage(started);
      setRuntime(INITIAL_RUNTIME);
      setPaused(false);
      setMenuOpen(false);
      setLeaderboardOpen(false);
      setMessage(`${stageId} 스테이지 시작! 하트를 모아 별을 밝혀주세요.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "스테이지 시작에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGameOver(snapshot: GameOverSnapshot) {
    if (!session || !activeStage || busy) return;
    setBusy(true);
    try {
      const payload: StageSubmitInput = {
        runId: activeStage.runId,
        stageId: activeStage.stageId,
        heartsCollected: snapshot.heartsCollected,
        starsLit: snapshot.starsLit,
        maxCombo: snapshot.maxCombo,
        cleared: snapshot.cleared,
        durationMs: snapshot.durationMs,
      };

      const result = await submitStage(session.token, payload);
      setProgress(result.progress);
      setActiveStage(null);
      setPaused(false);
      setMenuOpen(false);
      setRuntime(INITIAL_RUNTIME);
      await refreshStateAndBoard(session.token, leaderboard.metric);
      setMessage(
        `결과: 하트 ${result.stageResult.heartsCollected}, 별 ${result.stageResult.starsLit}, 최대 콤보 ${result.stageResult.maxCombo}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "스테이지 결과 제출에 실패했습니다.",
      );
      try {
        await refreshStateAndBoard(session.token, leaderboard.metric);
      } catch {
        // ignore refresh failure
      }
      setActiveStage(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeMetric(metric: LeaderboardMetric) {
    if (!session || busy) return;
    setBusy(true);
    try {
      const board = await getLeaderboard(session.token, metric, 20);
      setLeaderboard({ metric: board.metric, entries: board.entries });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "랭킹을 불러오지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!session || busy) return;
    setBusy(true);
    try {
      await logout(session.token);
    } catch {
      // ignore
    } finally {
      clearSession();
      setSession(null);
      setProgress(null);
      setActiveStage(null);
      setRuntime(INITIAL_RUNTIME);
      setPaused(false);
      setMenuOpen(false);
      setLeaderboardOpen(false);
      setMessage("로그아웃되었습니다.");
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="page">
        <section className="panel auth-panel">
          <header className="panel-header">
            <p className="subtitle">PROJECT HEARTSTAR</p>
            <h1 className="title">하트를 모아 별을 밝혀요</h1>
          </header>

          <div className="auth-box">
            <h2>{authMode === "login" ? "로그인" : "회원가입"}</h2>
            <label className="field">
              <span>아이디</span>
              <input
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="영문 또는 숫자로 3~24자 사이로 지어주세요"
              />
            </label>
            <label className="field">
              <span>PIN 4자리</span>
              <input
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value)}
                maxLength={4}
                inputMode="numeric"
                placeholder="예: 1234"
              />
            </label>
            <button
              className="cta"
              disabled={busy || !canAuthSubmit}
              onClick={() => handleAuth(authMode)}
              type="button"
            >
              {busy
                ? "처리 중..."
                : authMode === "login"
                  ? "로그인"
                  : "가입하기"}
            </button>
            <button
              className="mini-action"
              disabled={busy}
              onClick={() =>
                setAuthMode(authMode === "login" ? "join" : "login")
              }
              type="button"
            >
              {authMode === "login"
                ? "계정이 없으신가요? 가입"
                : "이미 계정이 있으신가요? 로그인"}
            </button>
          </div>

          <footer className="message">{message}</footer>
        </section>
      </main>
    );
  }

  return (
    <main className={`page${isPlaying ? " page--run" : ""}`}>
      <section className={`panel${isPlaying ? " panel--run" : ""}`}>
        {!isPlaying ? (
          <section className="lobby">
            <header className="panel-header">
              <p className="subtitle">반갑습니다, {session.username}님</p>
              <h1 className="title">Heartstar Pixel Adventure</h1>
            </header>

            <div className="lobby-layout">
              <figure className="hero-card" aria-hidden="true">
                <img
                  className="hero-card__image"
                  src="/front-char.png"
                  alt=""
                />
              </figure>

              <section className="lobby-content">
                <div className="card-grid">
                  <article className="metric-card">
                    <p>누적 하트</p>
                    <h3>{progress?.totalHearts ?? 0}</h3>
                  </article>
                  <article className="metric-card">
                    <p>누적 별 점등</p>
                    <h3>{progress?.totalStarsLit ?? 0}</h3>
                  </article>
                  <article className="metric-card">
                    <p>최고 콤보</p>
                    <h3>{progress?.bestCombo ?? 0}</h3>
                  </article>
                </div>

                <div className="button-row lobby-row">
                  <button
                    className="run-btn"
                    disabled={busy}
                    onClick={() => handleStartStage("meadow_1")}
                    type="button"
                  >
                    {busy ? "준비 중..." : "스테이지 시작"}
                  </button>
                  <button
                    className="ghost-btn"
                    disabled={busy}
                    onClick={handleLogout}
                    type="button"
                  >
                    로그아웃
                  </button>
                </div>

                <section
                  className="leaderboard-preview"
                  aria-labelledby="leaderboard-preview-title"
                >
                  <div className="leaderboard-preview__header">
                    <h2 id="leaderboard-preview-title">랭킹 요약</h2>
                    <p>{METRIC_LABEL[leaderboard.metric]} 기준 TOP 3</p>
                  </div>
                  <ol className="leaderboard-list leaderboard-list--compact">
                    {leaderboardPreview.length > 0 ? (
                      leaderboardPreview.map((entry) => (
                        <li key={`preview-${entry.rank}-${entry.username}`}>
                          <span>#{entry.rank}</span>
                          <strong>{entry.username}</strong>
                          <em>{entry.value}</em>
                        </li>
                      ))
                    ) : (
                      <li className="leaderboard-empty">
                        랭킹 데이터가 아직 없습니다.
                      </li>
                    )}
                  </ol>
                  <button
                    className="leaderboard-open-btn"
                    disabled={busy}
                    onClick={() => setLeaderboardOpen(true)}
                    type="button"
                  >
                    전체 랭킹 보기
                  </button>
                </section>
              </section>
            </div>

            {leaderboardOpen ? (
              <div
                className="leaderboard-modal-backdrop"
                role="presentation"
                onClick={() => setLeaderboardOpen(false)}
              >
                <section
                  className="leaderboard-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="leaderboard-modal-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="leaderboard-modal__top">
                    <div>
                      <p className="subtitle">GLOBAL LEADERBOARD</p>
                      <h2 id="leaderboard-modal-title">전체 랭킹</h2>
                    </div>
                    <button
                      className="leaderboard-close-btn"
                      onClick={() => setLeaderboardOpen(false)}
                      type="button"
                    >
                      닫기
                    </button>
                  </div>

                  <div className="leaderboard-tabs">
                    <button
                      type="button"
                      className={
                        leaderboard.metric === "hearts"
                          ? "tab tab--active"
                          : "tab"
                      }
                      disabled={busy}
                      onClick={() => handleChangeMetric("hearts")}
                    >
                      하트
                    </button>
                    <button
                      type="button"
                      className={
                        leaderboard.metric === "stars"
                          ? "tab tab--active"
                          : "tab"
                      }
                      disabled={busy}
                      onClick={() => handleChangeMetric("stars")}
                    >
                      별
                    </button>
                    <button
                      type="button"
                      className={
                        leaderboard.metric === "combo"
                          ? "tab tab--active"
                          : "tab"
                      }
                      disabled={busy}
                      onClick={() => handleChangeMetric("combo")}
                    >
                      콤보
                    </button>
                  </div>

                  <ol className="leaderboard-list leaderboard-list--modal">
                    {leaderboard.entries.length > 0 ? (
                      leaderboard.entries.map((entry) => (
                        <li key={`${entry.rank}-${entry.username}`}>
                          <span>#{entry.rank}</span>
                          <strong>{entry.username}</strong>
                          <em>{entry.value}</em>
                        </li>
                      ))
                    ) : (
                      <li className="leaderboard-empty">
                        랭킹 데이터가 아직 없습니다.
                      </li>
                    )}
                  </ol>
                </section>
              </div>
            ) : null}

            <footer className="message">{message}</footer>
          </section>
        ) : (
          <section className="run-shell">
            <div className="run-stage">
              <Suspense
                fallback={<div className="phaser-canvas" aria-busy="true" />}
              >
                <PhaserRunCanvas
                  className="phaser-canvas"
                  active={Boolean(activeStage)}
                  paused={paused}
                  onRuntime={setRuntime}
                  onGameOver={handleGameOver}
                  onLongPress={() => setPaused((prev) => !prev)}
                  onSwipeDown={() => setMenuOpen(true)}
                />
              </Suspense>

              <div className="run-overlay">
                <div className="hud-top" role="group" aria-label="게임 HUD">
                  <div
                    className="heart-gauge"
                    aria-label={`남은 하트 ${heartsLeft}`}
                  >
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className={
                          index < heartsLeft
                            ? "heart-slot heart-slot--on"
                            : "heart-slot heart-slot--off"
                        }
                        aria-hidden="true"
                      >
                        <img
                          className="heart-pixel"
                          src="/heart-pixel.gif"
                          alt="heart-pixel"
                        />
                      </span>
                    ))}
                  </div>

                  <div className="hud-score" aria-live="polite">
                    <p className="hud-score__label">SCORE</p>
                    <strong className="hud-score__value">
                      {runtime.heartsCollected}
                    </strong>
                    <span className="hud-score__meta">
                      STAR {runtime.starsLit}
                    </span>
                  </div>

                  <button
                    className="hud-icon-btn"
                    disabled={busy}
                    onClick={() => setPaused((prev) => !prev)}
                    type="button"
                    aria-label={paused ? "게임 재개" : "게임 일시정지"}
                  >
                    {paused ? "▶" : "Ⅱ"}
                  </button>
                </div>

                <p className="run-logo-badge" aria-hidden="true">
                  HEARTSTAR
                </p>

                <div
                  className="combo-center"
                  aria-label={`현재 콤보 ${runtime.currentCombo}`}
                >
                  <p className="combo-center__label">COMBO</p>
                  <strong className="combo-center__value">
                    {runtime.currentCombo}
                  </strong>
                </div>
              </div>

              <div
                className={
                  paused ? "hud-bottom hud-bottom--visible" : "hud-bottom"
                }
              >
                <div className="hud-actions">
                  <button
                    className="pause-btn hud-action-btn"
                    disabled={busy}
                    onClick={() => setPaused((prev) => !prev)}
                    type="button"
                  >
                    재개
                  </button>
                  <button
                    className="run-end-btn hud-action-btn"
                    disabled={busy}
                    onClick={() => {
                      if (!activeStage) return;
                      void handleGameOver({ ...runtime, cleared: false });
                    }}
                    type="button"
                  >
                    그만하기
                  </button>
                </div>
              </div>

              {menuOpen ? (
                <aside className="quick-menu">
                  <h3>퀵 메뉴</h3>
                  <button type="button" onClick={() => setMenuOpen(false)}>
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaused((prev) => !prev)}
                  >
                    {paused ? "게임 재개" : "게임 일시정지"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!activeStage) return;
                      void handleGameOver({ ...runtime, cleared: false });
                    }}
                  >
                    지금 종료
                  </button>
                </aside>
              ) : null}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
