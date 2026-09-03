import { expect, test, type Page } from '@playwright/test';

/**
 * M2 acceptance.
 *
 *   "400 seeded products search in under 100 ms; every quantity change leaves a
 *    movement row."
 *
 * Timed in the browser, on the real OPFS path, rather than only in Node.
 */

async function useEnglish(page: Page): Promise<void> {
  await page.goto('/settings');
  const english = page.getByRole('button', { name: 'English', exact: true });
  await english.waitFor({ state: 'visible' });
  await english.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

test('a product can be added, received and counted, leaving a movement each time', async ({
  page,
}) => {
  await useEnglish(page);

  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill('Sugar');
  await page.getByLabel('Price', { exact: true }).fill('170');
  await page.getByLabel('Cost', { exact: true }).fill('158');
  await page.getByLabel('Opening stock').fill('24');
  await page.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('button', { name: /Sugar/ });
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('.kv', { hasText: 'Quantity' }).locator('.kv__value')).toContainText(
    '24',
  );
  await expect(page.locator('.movement')).toHaveCount(1);

  // Receive 10 more at a new cost.
  await page.getByRole('button', { name: 'Receive stock' }).click();
  const receiveDialog = page.getByRole('dialog');
  await receiveDialog.getByLabel('How much came in?').fill('10');
  await receiveDialog.getByLabel(/Cost per/).fill('162');
  await receiveDialog.getByRole('button', { name: 'Receive stock' }).click();

  await expect(page.locator('.kv', { hasText: 'Quantity' }).locator('.kv__value')).toContainText(
    '34',
  );
  await expect(page.locator('.kv', { hasText: 'Cost' }).locator('.kv__value')).toContainText('162');
  await expect(page.locator('.movement')).toHaveCount(2);

  // Count 31.5 on the shelf: the book is corrected by an adjustment.
  await page.getByRole('button', { name: 'Stock take' }).click();
  const takeDialog = page.getByRole('dialog');
  await takeDialog.getByLabel('Counted quantity').fill('31.5');
  await takeDialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.kv', { hasText: 'Quantity' }).locator('.kv__value')).toContainText(
    '31.5',
  );
  await expect(page.locator('.movement')).toHaveCount(3);
  await expect(page.locator('.movement').first()).toContainText('-2.5');
});

test('400 products search in under 100ms on the real storage path', async ({ page }) => {
  await useEnglish(page);
  await page.goto('/settings/storage');
  await expect(page.getByTestId('storage-mode')).toHaveText('OPFS');

  await page.getByTestId('seed-catalogue').click();
  await expect(page.getByTestId('toast')).toContainText('400', { timeout: 60_000 });

  await expect(page.getByTestId('product-count')).toHaveText('400');

  // The storage check times the real repository query on the real storage path.
  await page.getByTestId('benchmark-search').click();
  await expect(page.getByTestId('search-ms')).not.toHaveText('—', { timeout: 30_000 });

  const reported = await page.getByTestId('search-ms').innerText();
  const milliseconds = Number(reported.replace(/[^\d.]/g, ''));
  expect(Number.isFinite(milliseconds)).toBe(true);
  expect(milliseconds).toBeLessThan(100);

  // And the search must actually filter, not just run fast.
  await page.goto('/stock');
  const search = page.getByRole('searchbox');
  await search.waitFor();
  await search.fill('Dalda');
  await expect(page.locator('.list__row').first()).toContainText('Dalda');
  const filtered = await page.locator('.list__row').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(400);
});
