import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/** A real 16x16 PNG, so createImageBitmap in the photo pipeline has something to decode. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4YWNDEmIY1TCqYfhqAACrxkAQIqaBzAAAAABJRU5ErkJggg==',
  'base64',
);

/** Attaches a product photo to Sugar and a customer photo to Akram. */
async function attachPhotos(page: Page, dir: string): Promise<void> {
  const png = join(dir, 'shot.png');
  writeFileSync(png, TINY_PNG);

  await page.goto('/stock');
  await page.getByRole('button', { name: /چینی|Sugar/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input[type="file"]').setInputFiles(png);
  // The picked photo shows in the field's preview frame before it is saved.
  await expect(page.getByRole('button', { name: /Retake photo/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/stock$/);

  await page.goto('/people');
  await page.getByRole('button', { name: /Akram/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input[type="file"]').setInputFiles(png);
  await expect(page.getByRole('button', { name: /Retake photo/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/people\/\d+$/);

  // And the product detail now shows the image, not the letter fallback.
  await page.goto('/stock');
  await page.getByRole('button', { name: /چینی|Sugar/ }).click();
  await expect(page.locator('img.product-photo')).toBeVisible({ timeout: 15_000 });
}

/** After a restore: the product and customer photos are back, not the letter fallback. */
async function expectPhotosRestored(page: Page): Promise<void> {
  await page.goto('/stock');
  await page.getByRole('button', { name: /چینی|Sugar/ }).click();
  await expect(page.locator('img.product-photo')).toBeVisible({ timeout: 15_000 });

  await page.goto('/people');
  await page.getByRole('button', { name: /Akram/ }).click();
  await expect(page.locator('img.customer-avatar')).toBeVisible({ timeout: 15_000 });
}

/**
 * M5 acceptance.
 *
 *   "Export → Reset all data → restore → every count and total matches exactly.
 *    A truncated file is rejected without corrupting the live database."
 *
 * This is the milestone where the app can actually lose someone's ledger, so
 * the test does the real thing: a real export to a real file, a real wipe, and
 * a real restore, then checks the numbers.
 */

async function useEnglish(page: Page): Promise<void> {
  await completeSetup(page);
}

async function addProductToCart(page: Page, name: string, quantity = 1): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('product-quantity').fill(String(quantity));
  await page.getByTestId('add-product-to-cart').click();
}

/** Sets a shop name, which the reset confirmation requires. */
async function setUpShop(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('Shop name').fill('Mandi Store');
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId('toast')).toBeVisible();
}

async function seedALedger(page: Page): Promise<void> {
  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill('Sugar');
  await page.getByLabel('Name (Urdu)').fill('چینی');
  await page.getByLabel('Price', { exact: true }).fill('170');
  await page.getByLabel('Cost', { exact: true }).fill('158');
  await page.getByLabel('Opening stock').fill('50');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /چینی|Sugar/ })).toBeVisible();

  await page.goto('/people/customer/new');
  await page.getByLabel('Name').fill('Akram');
  await page.getByLabel('Phone').fill('03001234567');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('customer-balance')).toBeVisible();

  // One cash sale.
  await page.goto('/sell');
  await addProductToCart(page, 'چینی|Sugar', 2);
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toBeVisible();

  // One udhaar sale, so the ledger has something in it.
  await page.goto('/sell');
  await addProductToCart(page, 'چینی|Sugar');
  await page.getByTestId('charge').click();
  await page.getByTestId('method-credit').click();
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Customer' }).getByRole('button', { name: 'Akram' }).click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toBeVisible();
}

interface Snapshot {
  products: string;
  stock: string;
  balance: string;
}

async function snapshot(page: Page): Promise<Snapshot> {
  await page.goto('/settings/storage');
  // The count renders "—" until its query resolves. Reading straight after the
  // navigation catches that placeholder often enough to make the comparison
  // below meaningless, so wait for a real figure first.
  const count = page.getByTestId('product-count');
  await expect(count).not.toHaveText('—');
  const products = await count.innerText();

  await page.goto('/stock');
  // The stock card's photo renders a one-letter fallback for a frame before the
  // image loads; read the quantity line only so the snapshot is stable.
  const stock = await page
    .getByRole('button', { name: /چینی|Sugar/ })
    .locator('.num')
    .first()
    .innerText();

  await page.goto('/people');
  await page.getByRole('button', { name: /Akram/ }).click();
  const balance = page.getByTestId('customer-balance');
  await expect(balance).not.toHaveText('—');

  return { products, stock, balance: await balance.innerText() };
}

test('export, wipe, restore — and every number comes back', async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  await useEnglish(page);
  await setUpShop(page);
  await seedALedger(page);
  await attachPhotos(page, mkdtempSync(join(tmpdir(), 'dukaan-shots-')));

  const before = await snapshot(page);
  expect(before.products).toBe('1');
  expect(before.stock).toContain('47'); // 50 less two, less one
  expect(before.balance).toBe('Rs 170');

  // Export a real .sqlite3 file.
  await page.goto('/settings');
  await page.getByTestId('format-sqlite').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('backup-download').click();
  const download = await downloadPromise;

  const dir = mkdtempSync(join(tmpdir(), 'dukaan-'));
  const backupPath = join(dir, 'backup.sqlite3');
  await download.saveAs(backupPath);
  expect(readFileSync(backupPath).byteLength).toBeGreaterThan(1000);
  testInfo.attach('backup', { path: backupPath });

  // The last-backup time is now recorded, so the overdue bar goes quiet.
  await expect(page.getByTestId('last-backup')).not.toHaveText('Never');

  // Wipe everything.
  await page.getByTestId('reset-open').click();
  const resetDialog = page.getByRole('dialog', { name: 'Reset all data' });
  await resetDialog.getByLabel('Type the shop name to confirm').fill('Mandi Store');
  await resetDialog.getByTestId('confirm-reset').click();

  await page.waitForURL('**/sell', { timeout: 30_000 });
  await useEnglish(page);
  await page.goto('/settings/storage');
  await expect(page.getByTestId('product-count')).toHaveText('0', { timeout: 30_000 });

  // Restore from the file.
  await page.goto('/settings');
  await page.getByTestId('restore-input').setInputFiles(backupPath);

  const confirm = page.getByRole('dialog', { name: 'Restore this backup?' });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  // The counts in the confirmation come from the incoming file itself.
  await expect(confirm).toContainText('1 products');
  await expect(confirm).toContainText('2 sales');
  await expect(confirm).toContainText('1 customers');
  await confirm.getByTestId('confirm-restore').click();

  await page.waitForURL('**/sell', { timeout: 30_000 });
  await useEnglish(page);

  const after = await snapshot(page);
  expect(after.products).toBe(before.products);
  expect(after.stock).toBe(before.stock);
  expect(after.balance).toBe(before.balance);

  // The product and customer photos survived the .sqlite3 round-trip.
  await expectPhotosRestored(page);

  // A sale after the restore must not collide with a restored invoice number.
  await page.goto('/sell');
  await addProductToCart(page, 'چینی|Sugar');
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toContainText('INV-000003');
});

test('a truncated backup is refused and the live ledger is untouched', async ({ page }) => {
  test.setTimeout(120_000);

  await useEnglish(page);
  await setUpShop(page);
  await seedALedger(page);
  const before = await snapshot(page);

  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('backup-download').click();
  const download = await downloadPromise;

  const dir = mkdtempSync(join(tmpdir(), 'dukaan-'));
  const good = join(dir, 'good.sqlite3');
  await download.saveAs(good);

  // Cut the file short, the way a half-finished WhatsApp transfer would.
  const truncated = join(dir, 'truncated.sqlite3');
  const bytes = readFileSync(good);
  writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.byteLength / 2) + 7));

  await page.getByTestId('restore-input').setInputFiles(truncated);

  // Refused by name, with no confirmation dialog and nothing replaced.
  // Scoped to role=alert: the "Backup made" status toast from the export a
  // moment ago may still be on screen.
  await expect(page.getByRole('alert')).toContainText(/incomplete|damaged|not recognised/i, {
    timeout: 30_000,
  });
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toHaveCount(0);

  const after = await snapshot(page);
  expect(after).toEqual(before);
});

test('rubbish that is not a backup at all is refused by name', async ({ page }) => {
  await useEnglish(page);

  const dir = mkdtempSync(join(tmpdir(), 'dukaan-'));
  const junk = join(dir, 'holiday.jpg');
  writeFileSync(junk, Buffer.from('this is a photo of a goat, not a ledger'));

  await page.goto('/settings');
  await page.getByTestId('restore-input').setInputFiles(junk);

  await expect(page.getByRole('alert')).toContainText('Backup file not recognised', {
    timeout: 30_000,
  });
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toHaveCount(0);
});

test('a JSON backup round-trips too, photos and all', async ({ page }) => {
  test.setTimeout(120_000);

  await useEnglish(page);
  await setUpShop(page);
  await seedALedger(page);
  await attachPhotos(page, mkdtempSync(join(tmpdir(), 'dukaan-shots-')));
  const before = await snapshot(page);

  await page.goto('/settings');
  await page.getByTestId('format-json').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('backup-download').click();
  const download = await downloadPromise;

  const dir = mkdtempSync(join(tmpdir(), 'dukaan-'));
  const jsonPath = join(dir, 'backup.json');
  await download.saveAs(jsonPath);

  const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8')) as {
    format: string;
    schemaVersion: number;
    tables: Record<string, unknown[]>;
  };
  expect(parsed.format).toBe('dukaan-backup');
  expect(parsed.schemaVersion).toBeGreaterThanOrEqual(3);
  expect(parsed.tables['products']).toHaveLength(1);
  expect(parsed.tables['sales']).toHaveLength(2);

  // Wipe, then restore from the JSON.
  await page.getByTestId('reset-open').click();
  const resetDialog = page.getByRole('dialog', { name: 'Reset all data' });
  await resetDialog.getByLabel('Type the shop name to confirm').fill('Mandi Store');
  await resetDialog.getByTestId('confirm-reset').click();
  await page.waitForURL('**/sell', { timeout: 30_000 });
  await useEnglish(page);

  await page.goto('/settings');
  await page.getByTestId('restore-input').setInputFiles(jsonPath);
  const confirm = page.getByRole('dialog', { name: 'Restore this backup?' });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await confirm.getByTestId('confirm-restore').click();
  await page.waitForURL('**/sell', { timeout: 30_000 });
  await useEnglish(page);

  const after = await snapshot(page);
  expect(after.products).toBe(before.products);
  expect(after.stock).toBe(before.stock);
  expect(after.balance).toBe(before.balance);

  // The photos survived the JSON round-trip — base64 in, bytes back out.
  await expectPhotosRestored(page);
});
