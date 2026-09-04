import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/**
 * The combined "is the ledger actually protected" feature.
 *
 * Two signals, checked separately elsewhere in the app: whether it is running
 * from the home screen (standalone display mode) and whether the browser
 * granted persistent storage. The one behaviour worth locking down here is
 * that the "add to home screen" nudge never fires once the app already is
 * installed — see src/lib/protection.ts for why that combination mattered.
 *
 * Two bars can carry that nudge and only ever one is on screen at a time:
 * `install-prompt` (cobalt, offers the install directly) takes precedence, and
 * `persist-warning` (amber) is the fallback for the day after the prompt has
 * been snoozed. Both are asserted here.
 */

async function useEnglish(page: Page): Promise<void> {
  await completeSetup(page);
}

/** Makes `isStandalone()` see the app as launched from the home screen. */
async function fakeStandalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === '(display-mode: standalone)') {
        return { matches: true } as MediaQueryList;
      }
      return original(query);
    };
  });
}

test('a browser tab, never installed: the banner nudges toward the home screen', async ({
  page,
}) => {
  await useEnglish(page);
  await page.goto('/settings/storage');

  // Headless Chromium in this test run never gets persist() granted, and this
  // page was never launched standalone — the one genuinely at-risk state.
  await expect(page.getByTestId('on-home-screen')).toHaveText('No');
  await expect(page.getByTestId('persisted-status')).toHaveText('No');

  await page.goto('/sell');
  const prompt = page.getByTestId('install-prompt');
  await expect(prompt).toBeVisible();

  // The nudge's fix actually goes somewhere, not just "Got it". Headless
  // Chromium fires no `beforeinstallprompt`, so this falls to the guide.
  await prompt.getByTestId('install-prompt-action').click();
  await expect(page).toHaveURL(/\/install$/);

  // And the guide says something true for this browser rather than a generic
  // "add to home screen" that would send a desktop user hunting for a Share
  // sheet that is not there.
  await expect(page.getByText('On a computer')).toBeVisible();
});

test('the install nudge snoozes for the day, then the amber bar takes over', async ({ page }) => {
  await useEnglish(page);
  await page.goto('/sell');

  const prompt = page.getByTestId('install-prompt');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Got it' }).click();
  await expect(prompt).toHaveCount(0);

  // Snoozed, not muted: it stays gone for the rest of the day...
  await page.reload();
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(page.getByTestId('install-prompt')).toHaveCount(0);

  // ...and the amber persistence bar steps in, so the risk is never silent.
  const banner = page.getByTestId('persist-warning');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Got it' }).click();
  await expect(banner).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(page.getByTestId('persist-warning')).toHaveCount(0);
});

test('installed to the home screen: no nag, even though persist() still lags', async ({
  page,
}) => {
  await fakeStandalone(page);
  await useEnglish(page);

  // The status screen shows the truth plainly...
  await page.goto('/settings/storage');
  await expect(page.getByTestId('on-home-screen')).toHaveText('Yes');
  // ...while persisted may still read No — this is the routine iOS case, and
  // the exact combination that used to trigger a banner telling the shopkeeper
  // to do something they had already done.
  await expect(page.getByTestId('persisted-status')).toHaveText('No');

  await page.goto('/sell');
  await expect(page.getByTestId('persist-warning')).toHaveCount(0);
  await expect(page.getByTestId('install-prompt')).toHaveCount(0);

  // The install section on Settings agrees: nothing left to do there either.
  // (It is a section heading, not a landmark <h*>, so matched by its exact
  // text rather than role — and the banner, which reuses the same string on
  // its "fix it" button, is confirmed absent above, so this text can only be
  // that section.)
  await page.goto('/settings');
  await expect(page.getByText('Add to home screen', { exact: true })).toHaveCount(0);
});
