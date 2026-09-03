import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/**
 * M6 acceptance.
 *
 *   "Today's totals reconcile against the raw sales rows."
 *
 * The reconciliation is proven arithmetically in the integration tests. Here it
 * is proven end to end: ring up known sales through the real till, then read the
 * Reports screen and check the figures are the ones a shopkeeper counting the
 * drawer would get.
 */

async function useEnglish(page: Page): Promise<void> {
  await completeSetup(page);
}

async function addProductToCart(page: Page, name: string, quantity = 1): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('product-quantity').fill(String(quantity));
  await page.getByTestId('add-product-to-cart').click();
}

test("today's figures match the sales that were actually rung up", async ({ page }) => {
  test.setTimeout(120_000);
  await useEnglish(page);

  // Sugar at Rs 170, costing Rs 158: Rs 12 of margin per kg.
  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill('Sugar');
  await page.getByLabel('Price', { exact: true }).fill('170');
  await page.getByLabel('Cost', { exact: true }).fill('158');
  await page.getByLabel('Opening stock').fill('100');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Sugar/ })).toBeVisible();

  await page.goto('/people/customer/new');
  await page.getByLabel('Name').fill('Akram');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('customer-balance')).toBeVisible();

  // Sale one: 2 kg for cash. Rs 340 in, Rs 24 of margin.
  await page.goto('/sell');
  await addProductToCart(page, 'Sugar', 2);
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toBeVisible();

  // Sale two: 3 kg on udhaar. Rs 510 of takings, none of it cash.
  await page.goto('/sell');
  await addProductToCart(page, 'Sugar', 3);
  await page.getByTestId('charge').click();
  await page.getByTestId('method-credit').click();
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Customer' }).getByRole('button', { name: 'Akram' }).click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toBeVisible();

  // Akram pays Rs 200 off the udhaar — old debt returning, not a new sale.
  await page.goto('/people');
  await page.getByRole('button', { name: /Akram/ }).click();
  await page.getByTestId('take-payment').click();
  const payment = page.getByRole('dialog', { name: 'Take payment' });
  await payment.getByLabel('How much did they pay?').fill('200');
  await payment.getByTestId('confirm-payment').click();
  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 310');

  await page.goto('/reports');
  await page.getByTestId('range-today').click();

  // Takings: 340 + 510. Cash in the drawer: only the 340.
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 850');
  await expect(page.getByTestId('report-cash')).toHaveText('Rs 340');
  await expect(page.getByTestId('report-credit')).toHaveText('Rs 510');
  await expect(page.getByTestId('report-payments')).toHaveText('Rs 200');
  // 5 kg at Rs 12 of margin each.
  await expect(page.getByTestId('report-profit')).toHaveText('Rs 60');
  // What is still on the book after the Rs 200 payment.
  await expect(page.getByTestId('report-outstanding')).toHaveText('Rs 310');

  // Yesterday had none of this.
  await page.getByTestId('range-yesterday').click();
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 0');
  await expect(page.getByTestId('report-cash')).toHaveText('Rs 0');
  // Outstanding udhaar is a running balance, not a range figure, so it stands.
  await expect(page.getByTestId('report-outstanding')).toHaveText('Rs 310');

  // This month includes today.
  await page.getByTestId('range-month').click();
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 850');
});

test('a voided sale drops out of the takings', async ({ page }) => {
  test.setTimeout(120_000);
  await useEnglish(page);

  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill('Ghee');
  await page.getByLabel('Price', { exact: true }).fill('720');
  await page.getByLabel('Cost', { exact: true }).fill('668');
  await page.getByLabel('Opening stock').fill('20');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Ghee/ })).toBeVisible();

  await page.goto('/sell');
  await addProductToCart(page, 'Ghee');
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toBeVisible();

  await page.goto('/reports');
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 720');

  // Void it from the receipt.
  await page.goto('/sell');
  await addProductToCart(page, 'Ghee');
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await page.getByRole('button', { name: 'Void this sale' }).click();
  await page.getByTestId('confirm-void').click();
  await expect(page.locator('[data-testid="void-tag"]')).toBeVisible();

  // Two sales rung up, one voided: the takings show only the surviving one.
  await page.goto('/reports');
  await expect(page.getByTestId('report-gross')).toHaveText('Rs 720');
  await expect(page.getByText(/1 voided/)).toBeVisible();
});

test('the range CSV export downloads real rows', async ({ page }) => {
  test.setTimeout(120_000);
  await useEnglish(page);

  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill('Atta');
  await page.getByLabel('Price', { exact: true }).fill('145');
  await page.getByLabel('Opening stock').fill('50');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Atta/ })).toBeVisible();

  await page.goto('/sell');
  await addProductToCart(page, 'Atta');
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toBeVisible();

  await page.goto('/reports');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/sales.*\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf-8');

  // Money is exported in rupees, not paisa: this file goes to an accountant.
  expect(text).toContain('total_rs');
  expect(text).toContain('INV-000001');
  expect(text).toContain('145');
  expect(text).not.toContain('14500');
});
