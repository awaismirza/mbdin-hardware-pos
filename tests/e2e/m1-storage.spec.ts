import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/**
 * M1 acceptance.
 *
 *   "Kill the tab, reopen, the test row is still there. Both storage paths
 *    work when the other is forced off."
 *
 * The tab kill is a real page.close() followed by a fresh page in the same
 * browser context — same origin, same storage, no in-memory state carried over.
 *
 * Everything here is addressed by test id rather than by label, because each
 * storage path has its own settings row and forcing the fallback opens a
 * different database.
 */

async function openStorageCheck(page: Page): Promise<void> {
  await completeSetup(page);
  await page.goto('/settings/storage');
  await page.getByTestId('write-row').waitFor({ state: 'visible' });
}

async function readyFallbackLedger(page: Page): Promise<void> {
  const name = page.getByTestId('setup-shop-name');
  await Promise.race([
    name.waitFor({ state: 'visible' }),
    expect(mode(page)).toContainText('IndexedDB'),
  ]);
  if (await name.isVisible()) {
    await name.fill('Fallback Test Store');
    await page.getByTestId('complete-setup').click();
  }
  await expect(mode(page)).toContainText('IndexedDB');
}

function mode(page: Page) {
  return page.getByTestId('storage-mode');
}

test.describe('storage', () => {
  test('a row written on OPFS survives a tab kill', async ({ context }) => {
    const page = await context.newPage();
    await openStorageCheck(page);

    // The header-free static host has no SharedArrayBuffer, so this asserts
    // that the opfs-sahpool VFS installed — the classic opfs VFS cannot.
    await expect(mode(page)).toHaveText('OPFS');

    await page.getByTestId('write-row').click();
    await expect(page.locator('.list__row')).toHaveCount(1);
    await page.getByTestId('write-row').click();
    await expect(page.locator('.list__row')).toHaveCount(2);

    // Kill the tab.
    await page.close();

    const reopened = await context.newPage();
    await openStorageCheck(reopened);
    await expect(mode(reopened)).toHaveText('OPFS');
    await expect(reopened.locator('.list__row')).toHaveCount(2);

    await reopened.getByTestId('clear-rows').click();
    await expect(reopened.locator('.list__row')).toHaveCount(0);
    await reopened.close();
  });

  test('the IndexedDB fallback also survives a tab kill', async ({ context }) => {
    const page = await context.newPage();
    await openStorageCheck(page);

    await page.getByTestId('force-idb').click();
    // OPFS and IndexedDB are deliberately separate ledgers. The fallback has
    // no shop details yet, so it follows the same first-launch setup.
    await readyFallbackLedger(page);

    await page.getByTestId('write-row').click();
    await expect(page.locator('.list__row')).toHaveCount(1);

    await page.close();

    // A fresh page boots on OPFS again, so force the fallback back on to read
    // what the fallback wrote — the two stores are deliberately separate files.
    const reopened = await context.newPage();
    await openStorageCheck(reopened);
    await expect(mode(reopened)).toHaveText('OPFS');
    await expect(reopened.locator('.list__row')).toHaveCount(0);

    await reopened.getByTestId('force-idb').click();
    await readyFallbackLedger(reopened);
    await expect(reopened.locator('.list__row')).toHaveCount(1);

    await reopened.getByTestId('clear-rows').click();
    await expect(reopened.locator('.list__row')).toHaveCount(0);
    await reopened.close();
  });

  test('the app boots offline from the service worker cache', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/sell');
    await completeSetup(page);
    // Wait for the worker to install and claim the page, which is when the
    // precache is complete and the app is genuinely offline-capable.
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker) return false;
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller !== null;
      },
      null,
      { timeout: 60_000 },
    );

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.shell__brand')).toBeVisible();
    // The database has to open offline too, not just the shell.
    await page.goto('/settings/storage');
    await expect(page.getByTestId('storage-mode')).toHaveText('OPFS');

    await context.setOffline(false);
    await page.close();
  });
});
