/**
 * `?fast=1` URL flag: every focus session lasts 10 seconds so the full loop
 * can be tested, demoed and filmed quickly. Works on the dev server and in the
 * production build; without the flag sessions use their normal length.
 */
export const FAST_SESSION_SECONDS = 10;

export function isFastMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('fast') === '1';
  } catch {
    return false;
  }
}

/**
 * `?demo=1` URL flag: Deeproom auto-plays its full loop with no input (orb
 * spawn, move onto the table, dial to 25 min, a completed 10 s session in the
 * first environment, then a flick-cancelled one in the second), repeating
 * forever. Implies 10 s sessions and never writes to localStorage.
 */
export function isDemoMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
}
