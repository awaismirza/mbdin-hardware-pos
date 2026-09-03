import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/**
 * M4 acceptance.
 *
 *   "Balance always equals the sum of ledger entries; voiding a credit sale
 *    reverses the charge."
 *
 * The arithmetic is proven exhaustively in the integration tests. This walks the
 * screens a shopkeeper actually touches: give udhaar, take a part payment,
 * watch the running balance, forgive the rest.
 */

async function useEnglish(page: Page): Promise<void> {
  await completeSetup(page);
}

async function addProductToCart(page: Page, name: string, quantity = 1): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('product-quantity').fill(String(quantity));
  await page.getByTestId('add-product-to-cart').click();
}

test('udhaar given, part paid, and the rest written off', async ({ page }) => {
  await useEnglish(page);

  // A product to sell.
  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill('Rice');
  await page.getByLabel('Price', { exact: true }).fill('340');
  await page.getByLabel('Cost', { exact: true }).fill('310');
  await page.getByLabel('Opening stock').fill('40');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Rice/ })).toBeVisible();

  // A customer with a credit limit low enough to trip the warning.
  await page.goto('/people/customer/new');
  await page.getByLabel('Name').fill('Bashir');
  await page.getByLabel('Phone').fill('03009876543');
  await page.getByLabel('Credit limit').fill('500');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 0');

  // Sell two bags on udhaar: Rs 680, over the Rs 500 limit.
  await page.goto('/sell');
  await addProductToCart(page, 'Rice', 2);
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 680');

  await page.getByTestId('charge').click();
  await page.getByTestId('method-credit').click();
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Customer' }).getByRole('button', { name: 'Bashir' }).click();
  await expect(page.getByTestId('udhaar-due')).toHaveText('Rs 680');
  await page.getByTestId('confirm-sale').click();

  // Over the limit: warned, never blocked.
  await expect(page.getByRole('dialog', { name: 'Over the credit limit' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Over the credit limit' })).toContainText('Rs 500');
  await page.getByTestId('charge-anyway').click();
  await expect(page.locator('.slip')).toContainText('Bashir');

  // The ledger carries the charge and the balance equals it.
  await page.goto('/people');
  await page.getByRole('button', { name: /Bashir/ }).click();
  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 680');
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.locator('.ledger-row').first()).toContainText('Charge');

  // Take Rs 400 of it.
  await page.getByTestId('take-payment').click();
  const payment = page.getByRole('dialog', { name: 'Take payment' });
  await payment.getByLabel('How much did they pay?').fill('400');
  await payment.getByRole('button', { name: 'Easypaisa' }).click();
  await payment.getByTestId('confirm-payment').click();

  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 280');
  await expect(page.locator('.ledger-row')).toHaveCount(2);
  // The running column is the shopkeeper's own check of the arithmetic.
  await expect(page.locator('.ledger-row').last().locator('.ledger-row__running')).toHaveText(
    '280',
  );

  // Forgive the remaining Rs 280 as an adjustment rather than deleting anything.
  await page.getByRole('button', { name: 'Adjust balance' }).click();
  const adjust = page.getByRole('dialog', { name: 'Adjust balance' });
  await adjust.getByLabel('Total').fill('-280');
  await adjust.getByLabel('Notes').fill('written off');
  await adjust.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByTestId('customer-balance')).toHaveText('Rs 0');
  await expect(page.locator('.ledger-row')).toHaveCount(3);
});

test('the people list leads with whoever owes the most', async ({ page }) => {
  await useEnglish(page);

  for (const [name, amount] of [
    ['Small debt', '100'],
    ['Big debt', '900'],
    ['Middle debt', '400'],
  ]) {
    await page.goto('/people/customer/new');
    await page.getByLabel('Name').fill(name!);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Adjust balance' }).click();
    const adjust = page.getByRole('dialog', { name: 'Adjust balance' });
    await adjust.getByLabel('Total').fill(amount!);
    await adjust.getByLabel('Notes').fill('opening');
    await adjust.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('customer-balance')).not.toHaveText('Rs 0');
  }

  await page.goto('/people');
  const rows = page.locator('.list__row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Big debt');
  await expect(rows.nth(1)).toContainText('Middle debt');
  await expect(rows.nth(2)).toContainText('Small debt');
});
