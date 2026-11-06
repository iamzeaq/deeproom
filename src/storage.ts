/**
 * Deeproom persistence in localStorage. Every access is wrapped in try/catch:
 * storage can be missing or throw (private windows, blocked site data), and
 * the app must keep working with in-memory defaults when it does.
 */

export interface Stats {
  sessions: number;
  streak: number;
  /** Local calendar day (YYYY-MM-DD) of the last completed session. */
  lastDay: string | null;
}

export interface Prefs {
  durationIndex: number;
  envIndex: number;
  muted: boolean;
}

const STATS_KEY = 'deeproom.stats.v1';
const PREFS_KEY = 'deeproom.prefs.v1';
const ONBOARDED_KEY = 'deeproom.onboarded.v1';

const DEFAULT_STATS: Stats = { sessions: 0, streak: 0, lastDay: null };
const DEFAULT_PREFS: Prefs = { durationIndex: 2, envIndex: 0, muted: false };

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: keep running without persistence.
  }
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${date.getFullYear()}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

export function loadStats(): Stats {
  const raw = readJson(STATS_KEY);
  if (raw == null) return { ...DEFAULT_STATS };
  return {
    sessions: int(raw.sessions, 0, 0, 1e9),
    streak: int(raw.streak, 0, 0, 1e6),
    lastDay: typeof raw.lastDay === 'string' ? raw.lastDay : null,
  };
}

/**
 * Applies one completed session at `now` to `stats`: same day keeps the
 * streak, the day after extends it, any longer gap restarts it at 1.
 */
export function applyCompletedSession(stats: Stats, now: Date): Stats {
  const today = dayKey(now);
  const yesterday = dayKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  let streak = 1;
  if (stats.lastDay === today) streak = Math.max(1, stats.streak);
  else if (stats.lastDay === yesterday) streak = stats.streak + 1;
  return { sessions: stats.sessions + 1, streak, lastDay: today };
}

export function recordCompletedSession(now = new Date()): Stats {
  const next = applyCompletedSession(loadStats(), now);
  writeJson(STATS_KEY, next);
  return next;
}

export function loadPrefs(): Prefs {
  const raw = readJson(PREFS_KEY);
  if (raw == null) return { ...DEFAULT_PREFS };
  return {
    durationIndex: int(raw.durationIndex, DEFAULT_PREFS.durationIndex, 0, 3),
    envIndex: int(raw.envIndex, DEFAULT_PREFS.envIndex, 0, 1),
    muted: raw.muted === true,
  };
}

export function savePrefs(prefs: Prefs): void {
  writeJson(PREFS_KEY, prefs);
}

export function isOnboarded(): boolean {
  try {
    return globalThis.localStorage?.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    globalThis.localStorage?.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Without storage the hints simply show again next launch.
  }
}
