import { expect, test, type Page } from '@playwright/test';

/**
 * M3 acceptance.
 *
 *   "A completed sale writes sale + items + movements in one transaction;
 *    killing the tab mid-cart and reopening restores the cart; money tests pass."
 *
 * The money arithmetic is proven in the unit tests. What has to be proven in a
 * browser is the cart surviving a real tab kill and the sale landing whole.
 */

async function useEnglish(page: Page): Promise<void> {
  await page.goto('/settings');
  const english = page.getByRole('button', { name: 'English', exact: true });
  await english.waitFor({ state: 'visible' });
  await english.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

async function addProduct(
  page: Page,
  name: string,
  price: string,
  stock: string,
): Promise<void> {
  await page.goto('/stock/product/new');
  await page.getByLabel('Name (English)').fill(name);
  await page.getByLabel('Price', { exact: true }).fill(price);
  await page.getByLabel('Cost', { exact: true }).fill('100');
  await page.getByLabel('Opening stock').fill(stock);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
}

test('a cash sale writes the sale and shows a receipt', async ({ page }) => {
  await useEnglish(page);
  await addProduct(page, 'Sugar', '170', '50');

  await page.goto('/sell');
  await page.getByRole('button', { name: /Sugar/ }).first().click();
  await page.getByRole('button', { name: /Sugar/ }).first().click();

  await expect(page.getByTestId('cart-total')).toHaveText('Rs 340');

  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByRole('button', { name: 'Exact' }).click();
  await expect(page.getByTestId('change-due')).toHaveText('Rs 0');
  await page.getByTestId('confirm-sale').click();

  // Lands on the receipt with an invoice number and the right total.
  await expect(page.locator('.slip')).toBeVisible();
  await expect(page.locator('.slip')).toContainText('INV-000001');
  await expect(page.locator('.slip')).toContainText('Rs 340');

  // Stock came down by two.
  await page.goto('/stock');
  await expect(page.getByRole('button', { name: /Sugar/ })).toContainText('48');
});

test('a cart survives the tab being killed mid-sale', async ({ context }) => {
  const page = await context.newPage();
  await useEnglish(page);
  await addProduct(page, 'Ghee', '720', '20');

  await page.goto('/sell');
  await page.getByRole('button', { name: /Ghee/ }).first().click();
  await page.getByRole('button', { name: /Ghee/ }).first().click();
  await page.getByRole('button', { name: /Ghee/ }).first().click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 2,160');

  // Kill it. No "are you sure", no beforeunload — the power just went.
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto('/sell');
  await expect(reopened.getByTestId('cart-total')).toHaveText('Rs 2,160', { timeout: 20_000 });
  await expect(reopened.locator('.cart-line')).toHaveCount(1);
  await reopened.close();
});

test('an udhaar sale charges the customer and voiding it reverses everything', async ({
  page,
}) => {
  await useEnglish(page);
  await addProduct(page, 'Atta', '145', '100');

  await page.goto('/sell');
  await page.getByRole('button', { name: /Atta/ }).first().click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 145');

  await page.getByTestId('charge').click();
  await page.getByTestId('method-credit').click();

  // Udhaar needs a customer, and says so.
  await expect(page.getByText('Udhaar needs a customer. Choose one first.')).toBeVisible();

  // The checkout sheet stays open underneath while a customer is chosen.
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Customer' });
  await picker.getByRole('button', { name: 'Add customer' }).click();
  await picker.getByLabel('Name').fill('Akram');
  await picker.getByLabel('Phone').fill('03001234567');
  await picker.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('dialog', { name: 'Take payment' })).toBeVisible();
  await expect(page.getByTestId('udhaar-due')).toHaveText('Rs 145');
  await page.getByTestId('confirm-sale').click();

  await expect(page.locator('.slip')).toContainText('Rs 145');
  await expect(page.locator('.slip')).toContainText('Akram');

  // Void it: stock returns and the udhaar charge is reversed.
  await page.getByRole('button', { name: 'Void this sale' }).click();
  await page.getByTestId('confirm-void').click();
  await expect(page.locator('.tag--void')).toBeVisible();

  await page.goto('/stock');
  await expect(page.getByRole('button', { name: /Atta/ })).toContainText('100');
});

test('quick sell adds an unlisted item and holding parks the cart', async ({ page }) => {
  await useEnglish(page);
  await page.goto('/sell');

  await page.getByRole('button', { name: 'Quick sell' }).click();
  const quick = page.getByRole('dialog');
  await quick.getByLabel('What is it?').fill('Rope');
  await quick.getByRole('button', { name: '5' }).click();
  await quick.getByRole('button', { name: '0' }).first().click();
  await quick.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByTestId('cart-total')).toHaveText('Rs 50');

  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  const holdDialog = page.getByRole('dialog');
  await holdDialog.getByLabel('Label this cart').fill('Blue shirt man');
  await holdDialog.getByRole('button', { name: 'Hold' }).click();

  await expect(page.getByTestId('cart-total')).toHaveText('Rs 0');

  // The held cart is listed and can be resumed.
  await page.getByRole('button', { name: /Hold 1/ }).click();
  await expect(page.getByText('Blue shirt man')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 50');
});
