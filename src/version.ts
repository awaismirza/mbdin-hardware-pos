import { version } from '../package.json';

/** Semver from package.json — the single source of truth. Bumped by a release. */
export const APP_VERSION: string = version;

declare const __BUILD_TIME__: string;

/** ISO timestamp stamped by Vite at build time; empty under plain tsc. */
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** "3 Sep 2026" from BUILD_TIME, or "" if it was not stamped (dev / tests). */
export function buildDate(): string {
  if (!BUILD_TIME) return '';
  const date = new Date(BUILD_TIME);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
