import { expect, test } from '@playwright/test';

test('first launch starts in English and saves the chosen shop details', async ({ page }) => {
  await page.goto('/sell');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Set up your shop' })).toBeVisible();
  await page.getByTestId('complete-setup').click();
  await expect(page.getByRole('alert')).toHaveText('Add your shop name to continue.');

  await page.getByTestId('setup-shop-name').fill('Corner Store');
  await page.getByLabel('Shop phone (Optional)').fill('03001234567');
  await page.getByTestId('complete-setup').click();
  await expect(page).toHaveURL(/\/sell$/);

  await page.goto('/settings');
  await expect(page.getByLabel('Shop name')).toHaveValue('Corner Store');
  await expect(page.getByLabel('Shop phone')).toHaveValue('03001234567');
});

test('first launch can be completed in Urdu', async ({ page }) => {
  await page.goto('/sell');
  await page.getByTestId('setup-language-ur').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('setup-shop-name').fill('الرحمٰن جنرل سٹور');
  await page.getByTestId('complete-setup').click();
  await expect(page).toHaveURL(/\/sell$/);
});
