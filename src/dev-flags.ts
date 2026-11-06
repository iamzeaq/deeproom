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
