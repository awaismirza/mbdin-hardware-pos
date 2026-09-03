/**
 * Whether the ledger is actually protected from being cleared, combining the
 * two signals that matter and are otherwise checked separately:
 *
 *   - installed: the app is running from the home screen (standalone display
 *     mode), not a browser tab.
 *   - persisted: the browser granted navigator.storage.persist().
 *
 * The two are related but not the same question. On Android Chrome,
 * persist() is granted automatically based on how "engaged" the browser
 * thinks the user is with the site — daily use and a home-screen install both
 * count heavily toward that, so installing is usually what tips it into being
 * granted. On iOS Safari, persist() barely matters: what actually protects the
 * data is running as a standalone home-screen app at all, which exempts the
 * origin from Safari's 7-day no-visit eviction of script-writable storage for
 * ordinary tabs.
 *
 * The one thing this module exists to prevent: nagging a shopkeeper to "add to
 * home screen" after they already have. That was happening — the amber banner
 * fired on `persisted === false` alone, so an installed shop with the browser
 * simply not having flipped the flag yet (which can lag, and on iOS is close
 * to permanent) saw advice they had already followed and could not act on
 * further.
 */

export type ProtectionLevel =
  /** The browser has granted persistent storage. Nothing more to do. */
  | 'protected'
  /** Installed, but the browser has not (yet, or ever) granted persist().
   *  Not the shopkeeper's problem to fix — there is no further action. */
  | 'installed-unconfirmed'
  /** Not installed and not persisted: the real risk, and the actionable one —
   *  adding the app to the home screen is the fix. */
  | 'at-risk'
  /** persist() was never asked, or the browser has no opinion yet. */
  | 'unknown';

export function protectionLevel(
  installed: boolean,
  persisted: boolean | null,
): ProtectionLevel {
  if (persisted === null) return 'unknown';
  if (persisted) return 'protected';
  return installed ? 'installed-unconfirmed' : 'at-risk';
}

/**
 * The one case worth a banner: not installed, and the browser has refused (or
 * not granted) persistence. This is the only state where "add to home screen"
 * is both true advice and something the shopkeeper has not already done.
 */
export function shouldWarnAboutPersistence(
  installed: boolean,
  persisted: boolean | null,
  dismissed: boolean,
): boolean {
  return protectionLevel(installed, persisted) === 'at-risk' && !dismissed;
}
