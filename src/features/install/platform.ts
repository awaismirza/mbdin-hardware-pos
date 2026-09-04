/**
 * Which install path this device actually has.
 *
 * This exists because "add to home screen" is four different gestures on four
 * different browsers, and the wrong instructions are worse than none — a
 * shopkeeper told to look for a Share button that is not there concludes the
 * app is broken and goes back to paper.
 *
 * The two facts that decide everything:
 *
 *   1. Chromium browsers fire `beforeinstallprompt`, so the app can install
 *      itself with one tap. Everything else needs the user to do it by hand.
 *   2. Every browser on iOS is WebKit — Chrome, Firefox and Edge on an iPhone
 *      are Safari with a different chrome around it. Only Safari's own Share
 *      sheet has "Add to Home Screen"; the others cannot install at all, so
 *      the honest instruction there is "open this page in Safari first".
 */

export type Platform =
  /** iOS/iPadOS Safari — Share ▸ Add to Home Screen. */
  | 'ios-safari'
  /** iOS/iPadOS Chrome, Firefox, Edge — WebKit underneath, cannot install. */
  | 'ios-other'
  /** Android Chrome/Edge/Samsung — has `beforeinstallprompt`. */
  | 'android'
  /** Desktop Chrome/Edge — install icon in the address bar. */
  | 'desktop-chromium'
  /** Desktop Safari — Share ▸ Add to Dock (macOS Sonoma and later). */
  | 'desktop-safari'
  /** Firefox and anything else with no install path worth describing. */
  | 'unsupported';

interface Signals {
  ua: string;
  touch: boolean;
  maxTouchPoints: number;
}

function readSignals(): Signals | null {
  if (typeof navigator === 'undefined') return null;
  return {
    ua: navigator.userAgent,
    touch: typeof document !== 'undefined' && 'ontouchend' in document,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };
}

/**
 * True on iPhone and iPad, including an iPad in desktop mode — which reports a
 * Macintosh UA and is only distinguishable by having a touchscreen.
 */
export function isIos(signals = readSignals()): boolean {
  if (!signals) return false;
  if (/iPad|iPhone|iPod/.test(signals.ua)) return true;
  return signals.ua.includes('Macintosh') && signals.maxTouchPoints > 1;
}

export function detectPlatform(signals = readSignals()): Platform {
  if (!signals) return 'unsupported';
  const { ua } = signals;

  if (isIos(signals)) {
    // CriOS/FxiOS/EdgiOS are the in-app names of Chrome/Firefox/Edge on iOS.
    return /CriOS|FxiOS|EdgiOS|OPT\//.test(ua) ? 'ios-other' : 'ios-safari';
  }

  const chromium = /Chrome|Chromium|CriOS|Edg\/|SamsungBrowser/.test(ua) && !/OPR\//.test(ua);
  if (/Android/.test(ua)) return chromium ? 'android' : 'unsupported';

  if (chromium) return 'desktop-chromium';
  // Desktop Safari reports Safari but never Chrome.
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'desktop-safari';
  return 'unsupported';
}

/** Whether this platform can be walked through installing by hand. */
export function hasManualGuide(platform: Platform): boolean {
  return platform !== 'unsupported';
}

/**
 * The i18n key set for each platform's steps. Kept here rather than in the
 * component so the copy and the detection stay in one place.
 */
export const GUIDE_STEPS: Record<Platform, readonly string[]> = {
  'ios-safari': ['install.ios.step1', 'install.ios.step2', 'install.ios.step3'],
  'ios-other': ['install.iosOther.step1', 'install.iosOther.step2', 'install.iosOther.step3'],
  android: ['install.android.step1', 'install.android.step2', 'install.android.step3'],
  'desktop-chromium': [
    'install.desktop.step1',
    'install.desktop.step2',
    'install.desktop.step3',
  ],
  'desktop-safari': [
    'install.desktopSafari.step1',
    'install.desktopSafari.step2',
    'install.desktopSafari.step3',
  ],
  unsupported: [],
} as const;

export const PLATFORM_TITLE: Record<Platform, string> = {
  'ios-safari': 'install.title.iosSafari',
  'ios-other': 'install.title.iosOther',
  android: 'install.title.android',
  'desktop-chromium': 'install.title.desktop',
  'desktop-safari': 'install.title.desktopSafari',
  unsupported: 'install.title.unsupported',
} as const;
