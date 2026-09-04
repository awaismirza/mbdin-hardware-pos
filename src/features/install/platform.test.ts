import { describe, expect, it } from 'vitest';

import { detectPlatform, isIos, type Platform } from './platform';

function signals(ua: string, maxTouchPoints = 0) {
  return { ua, touch: maxTouchPoints > 0, maxTouchPoints };
}

const CASES: readonly [string, string, number, Platform][] = [
  [
    'iPhone Safari',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    5,
    'ios-safari',
  ],
  [
    'iPhone Chrome',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
    5,
    'ios-other',
  ],
  [
    'iPhone Firefox',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
    5,
    'ios-other',
  ],
  [
    'iPad in desktop mode',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    5,
    'ios-safari',
  ],
  [
    'Android Chrome',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    5,
    'android',
  ],
  [
    'Samsung Internet',
    'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    5,
    'android',
  ],
  [
    'Desktop Chrome',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    0,
    'desktop-chromium',
  ],
  [
    'Desktop Safari on a Mac',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    0,
    'desktop-safari',
  ],
  [
    'Desktop Firefox',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
    0,
    'unsupported',
  ],
];

describe('detectPlatform', () => {
  it.each(CASES)('reads %s correctly', (_name, ua, touchPoints, expected) => {
    expect(detectPlatform(signals(ua, touchPoints))).toBe(expected);
  });

  /*
   * The one that actually bites: an iPad set to "Request Desktop Website"
   * reports a Macintosh UA and is otherwise indistinguishable from a real Mac.
   * Only maxTouchPoints separates them, and getting it wrong sends an iPad user
   * looking for a Dock they do not have.
   */
  it('tells an iPad in desktop mode apart from a real Mac by the touchscreen', () => {
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    expect(isIos(signals(mac, 5))).toBe(true);
    expect(isIos(signals(mac, 0))).toBe(false);
  });
});
