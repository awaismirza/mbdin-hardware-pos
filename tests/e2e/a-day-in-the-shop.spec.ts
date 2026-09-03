import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

async function addProductToCart(page: Page, name: string, quantity = 1): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('product-quantity').fill(String(quantity));
  await page.getByTestId('add-product-to-cart').click();
}

/**
 * The whole day, in Urdu, right to left — the end-to-end pass the spec asks
 * for: add a product, sell for cash, sell on credit, take a payment, export,
 * reset, restore, and check the totals came back.
 *
 * Everything here is driven through the Urdu interface on purpose. The other
 * specs use English because a failure there should read plainly in the report;
 * this one exists to prove the app a Mandi Bahauddin shopkeeper actually sees
 * works, in the direction he actually reads.
 */
test('a day in the shop, in Urdu', async ({ page }) => {
  test.setTimeout(180_000);

  // Urdu remains an explicit RTL acceptance path; regular tests start in English.
  await completeSetup(page, { language: 'ur', shopName: 'الرحمٰن جنرل سٹور' });
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.getByLabel('دکان کا نام').fill('الرحمٰن جنرل سٹور');
  await page.getByLabel('دکان کا فون').fill('03001234567');
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId('toast')).toBeVisible();

  // ── Add a product ───────────────────────────────────────────────────────
  await page.goto('/stock/product/new');
  await page.getByLabel('نام (اردو)').fill('چینی');
  await page.getByLabel('نام (انگریزی)').fill('Sugar');
  await page.getByLabel('ریٹ', { exact: true }).fill('170');
  await page.getByLabel('لاگت', { exact: true }).fill('158');
  await page.getByLabel('ابتدائی مال').fill('50');
  await page.getByRole('button', { name: 'محفوظ کریں' }).click();
  await expect(page.getByRole('button', { name: /چینی/ })).toBeVisible();

  // ── Sell two kilos for cash ─────────────────────────────────────────────
  await page.goto('/sell');
  await addProductToCart(page, 'چینی', 2);
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 340');

  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByRole('button', { name: 'پورے' }).click();
  await expect(page.getByTestId('change-due')).toHaveText('Rs 0');
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toContainText('INV-000001');

  // ── Sell three more on udhaar ───────────────────────────────────────────
  await page.goto('/sell');
  await addProductToCart(page, 'چینی', 3);
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 510');

  await page.getByTestId('charge').click();
  await page.getByTestId('method-credit').click();
  await page.getByRole('button', { name: 'گاہک', exact: true }).click();

  const picker = page.getByRole('dialog', { name: 'گاہک' });
  await picker.getByRole('button', { name: 'نیا گاہک' }).click();
  await picker.getByLabel('نام').fill('محمد اکرم');
  await picker.getByLabel('فون').fill('03009876543');
  await picker.getByRole('button', { name: 'محفوظ کریں' }).click();

  await expect(page.getByTestId('udhaar-due')).toHaveText('Rs 510');
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toContainText('محمد اکرم');

  // ── Take a payment against the udhaar ───────────────────────────────────
  await page.goto('/people');
  await page.getByRole('button', { name: /محمد اکرم/ }).click();
  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 510');

  await page.getByTestId('take-payment').click();
  const payment = page.getByRole('dialog', { name: 'رقم وصول کریں' });
  await payment.getByLabel('کتنے پیسے دیے؟').fill('200');
  await payment.getByTestId('confirm-payment').click();
  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 310');

  // ── What the day came to ────────────────────────────────────────────────
  await page.goto('/reports');
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 850');
  await expect(page.getByTestId('report-cash')).toHaveText('Rs 340');
  await expect(page.getByTestId('report-credit')).toHaveText('Rs 510');
  await expect(page.getByTestId('report-payments')).toHaveText('Rs 200');
  await expect(page.getByTestId('report-outstanding')).toHaveText('Rs 310');

  // ── Export ──────────────────────────────────────────────────────────────
  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('backup-download').click();
  const download = await downloadPromise;

  const dir = mkdtempSync(join(tmpdir(), 'dukaan-day-'));
  const backup = join(dir, 'end-of-day.sqlite3');
  await download.saveAs(backup);
  expect(readFileSync(backup).byteLength).toBeGreaterThan(1000);

  // ── Reset everything ────────────────────────────────────────────────────
  await page.getByTestId('reset-open').click();
  const reset = page.getByRole('dialog', { name: 'سارا ڈیٹا مٹائیں' });
  await reset.getByLabel('تصدیق کے لیے دکان کا نام لکھیں').fill('الرحمٰن جنرل سٹور');
  await reset.getByTestId('confirm-reset').click();
  await page.waitForURL('**/sell', { timeout: 30_000 });

  // Reset returns the app to first launch. Set a temporary shop up so the
  // restore controls are available; the incoming backup replaces it.
  await completeSetup(page, { language: 'ur', shopName: 'عارضی دکان' });
  await page.goto('/settings/storage');
  await expect(page.getByTestId('product-count')).toHaveText('0', { timeout: 30_000 });

  // ── Restore ─────────────────────────────────────────────────────────────
  await page.goto('/settings');
  await page.getByTestId('restore-input').setInputFiles(backup);
  const confirm = page.getByRole('dialog', { name: 'یہ بیک اپ واپس لائیں؟' });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await confirm.getByTestId('confirm-restore').click();
  await page.waitForURL('**/sell', { timeout: 30_000 });

  // ── Every total is back ─────────────────────────────────────────────────
  await page.goto('/reports');
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 850');
  await expect(page.getByTestId('report-cash')).toHaveText('Rs 340');
  await expect(page.getByTestId('report-outstanding')).toHaveText('Rs 310');

  await page.goto('/people');
  await page.getByRole('button', { name: /محمد اکرم/ }).click();
  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 310');
  await expect(page.locator('.ledger-row')).toHaveCount(2);

  await page.goto('/stock');
  await expect(page.getByRole('button', { name: /چینی/ })).toContainText('45');

  // The shop name came back too, so the receipt still says who sold it.
  await page.goto('/settings');
  await expect(page.getByLabel('دکان کا نام')).toHaveValue('الرحمٰن جنرل سٹور');
});
