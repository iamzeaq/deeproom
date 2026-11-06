/**
 * Dev-only `?fast=1` URL flag: every focus session lasts 10 seconds so the
 * full loop can be tested and filmed quickly. Always false in production.
 */
export const FAST_SESSION_SECONDS = 10;

export function isFastMode(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).get('fast') === '1';
  } catch {
    return false;
  }
}
