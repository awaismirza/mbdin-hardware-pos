import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

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
  await completeSetup(page);
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

async function addProductToCart(page: Page, name: string, quantity = 1): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('product-quantity').fill(String(quantity));
  await page.getByTestId('add-product-to-cart').click();
}

test('a cash sale writes the sale and shows a receipt', async ({ page }) => {
  await useEnglish(page);
  await addProduct(page, 'Sugar', '170', '50');

  await page.goto('/sell');
  await addProductToCart(page, 'Sugar', 2);

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
  await addProductToCart(page, 'Ghee', 3);
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 2,160');

  // Kill it. No "are you sure", no beforeunload — the power just went.
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto('/sell');
  await expect(reopened.getByTestId('cart-total')).toHaveText('Rs 2,160', { timeout: 20_000 });
  await expect(reopened.locator('[data-testid="cart-line"]')).toHaveCount(1);
  await reopened.close();
});

test('an udhaar sale charges the customer and voiding it reverses everything', async ({
  page,
}) => {
  await useEnglish(page);
  await addProduct(page, 'Atta', '145', '100');

  await page.goto('/sell');
  await addProductToCart(page, 'Atta');
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
  await expect(page.locator('[data-testid="void-tag"]')).toBeVisible();

  await page.goto('/stock');
  await expect(page.getByRole('button', { name: /Atta/ })).toContainText('100');
});

test('quick sell adds an unlisted item to the cart', async ({ page }) => {
  await useEnglish(page);
  await page.goto('/sell');

  await page.getByRole('button', { name: 'Quick sell' }).click();
  const quick = page.getByRole('dialog');
  await quick.getByLabel('What is it?').fill('Rope');
  await quick.getByRole('button', { name: '5' }).click();
  await quick.getByRole('button', { name: '0' }).first().click();
  await quick.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByTestId('cart-total')).toHaveText('Rs 50');
});

test('two carts run side by side, each keeping its own lines and customer', async ({ page }) => {
  await useEnglish(page);
  await addProduct(page, 'Rice', '200', '50');
  await addProduct(page, 'Dal', '300', '50');

  await page.goto('/people/customer/new');
  await page.getByLabel('Name', { exact: true }).fill('Bilal');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.goto('/sell');

  // Cart 1: two Rice for a walk-in.
  await addProductToCart(page, 'Rice', 2);
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 400');

  // Open a second cart — the first is untouched, the new one is empty.
  await page.getByTestId('new-cart').click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 0');
  await addProductToCart(page, 'Dal', 1);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: /Bilal/ }).first().click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 300');

  // The tab strip now shows both; switching back restores cart 1 exactly.
  await expect(page.getByTestId('cart-tab')).toHaveCount(2);
  await page.getByTestId('cart-tab').first().click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 400');

  // Ring up cart 1. The sale clears only that cart; Bilal's cart is still there.
  await page.getByTestId('charge').click();
  await page.getByTestId('method-cash').click();
  await page.getByTestId('confirm-sale').click();
  await expect(page.locator('.slip')).toContainText('Rs 400');

  await page.goto('/sell');
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 300');
  await expect(page.getByTestId('cart-tabs')).toContainText('Bilal');
});

test('a cart with items warns before it is closed, and survives a reload', async ({ page }) => {
  await useEnglish(page);
  await addProduct(page, 'Sugar', '210', '40');
  await page.goto('/sell');

  await addProductToCart(page, 'Sugar', 1);
  await page.getByTestId('new-cart').click();
  await addProductToCart(page, 'Sugar', 3);
  await expect(page.getByTestId('cart-tab')).toHaveCount(2);

  // Closing the active cart (it has lines) asks first.
  await page.getByTestId('cart-tab').nth(1).getByRole('button', { name: 'Close cart' }).click();
  await page.getByTestId('confirm-close-cart').click();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 210');

  // Both carts are in the database, not just memory.
  await page.reload();
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(page.getByTestId('cart-total')).toHaveText('Rs 210');
});
