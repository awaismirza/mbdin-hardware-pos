import { expect, type Page } from '@playwright/test';

export interface SetupOptions {
  language?: 'en' | 'ur';
  shopName?: string;
}

/** Completes first-launch setup when this browser context has no shop yet. */
export async function completeSetup(page: Page, options: SetupOptions = {}): Promise<void> {
  const { language = 'en', shopName = 'Test Store' } = options;
  await page.goto('/sell');
  const name = page.getByTestId('setup-shop-name');
  const shell = page.locator('.shell');
  await Promise.race([
    name.waitFor({ state: 'visible', timeout: 15_000 }),
    shell.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);

  if (await name.isVisible()) {
    if (language === 'ur') {
      await page.getByTestId('setup-language-ur').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    }
    await name.fill(shopName);
    await page.getByTestId('complete-setup').click();
  } else if ((await page.locator('html').getAttribute('lang')) !== language) {
    await page.goto('/settings');
    await page.getByRole('button', { name: language === 'ur' ? 'اردو' : 'English', exact: true }).click();
    await page.goto('/sell');
  }
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page).toHaveURL(/\/sell$/);
}
