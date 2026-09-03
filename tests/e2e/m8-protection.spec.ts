import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/**
 * The combined "is the ledger actually protected" feature.
 *
 * Two signals, checked separately elsewhere in the app: whether it is running
 * from the home screen (standalone display mode) and whether the browser
 * granted persistent storage. The one behaviour worth locking down here is
 * that the "add to home screen" banner never fires once the app already is
 * installed — see src/lib/protection.ts for why that combination mattered.
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
  const banner = page.getByTestId('persist-warning');
  await expect(banner).toBeVisible();

  // The banner's fix actually goes somewhere, not just "Got it".
  await banner.getByRole('button', { name: 'Add to home screen' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('dismissing the banner keeps it gone across a reload', async ({ page }) => {
  await useEnglish(page);
  await page.goto('/sell');

  const banner = page.getByTestId('persist-warning');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Got it' }).click();
  await expect(banner).toHaveCount(0);

  await page.reload();
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

  // The install section on Settings agrees: nothing left to do there either.
  // (It is a section heading, not a landmark <h*>, so matched by its exact
  // text rather than role — and the banner, which reuses the same string on
  // its "fix it" button, is confirmed absent above, so this text can only be
  // that section.)
  await page.goto('/settings');
  await expect(page.getByText('Add to home screen', { exact: true })).toHaveCount(0);
});
