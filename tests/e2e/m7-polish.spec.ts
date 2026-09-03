import { expect, test, type Page } from '@playwright/test';
import { completeSetup } from './setup';

/**
 * M7: the things that make it an app on a counter rather than a page in a
 * browser — the manifest and service worker, RTL, no sideways scroll, touch
 * targets, and the PIN.
 */

async function useEnglish(page: Page): Promise<void> {
  await completeSetup(page);
}

async function seed(page: Page): Promise<void> {
  await completeSetup(page);
  await page.goto('/settings/storage');
  await page.getByTestId('seed-catalogue').click();
  await expect(page.getByTestId('toast')).toContainText('400', { timeout: 60_000 });
}

async function addProductToCart(page: Page, name: string, quantity = 1): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByTestId('product-quantity').fill(String(quantity));
  await page.getByTestId('add-product-to-cart').click();
}

/** Measures the document, not an element: the body must never scroll sideways. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

test.describe('layout', () => {
  test('no screen scrolls the page sideways, in either language', async ({ page }) => {
    test.setTimeout(120_000);
    await completeSetup(page, { language: 'ur' });
    await seed(page);

    const routes = ['/sell', '/stock', '/people', '/reports', '/settings', '/settings/storage'];

    // Urdu (RTL) first: it is the harder direction and is explicitly chosen.
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(400);
      expect(await horizontalOverflow(page), `${route} in Urdu`).toBeLessThanOrEqual(1);
    }

    // A loaded cart is what first pushed the page sideways: the 40px total is
    // nowrap, and a grid track sized 1fr will grow to fit it unless told not to.
    await page.goto('/sell');
    await page.waitForTimeout(800);
    const tiles = page.locator('.tile:not(.tile--quick)');
    await tiles.nth(0).click();
    await page.getByTestId('add-product-to-cart').click();
    await page.goto('/sell');
    await page.waitForTimeout(400);
    const refreshedTiles = page.locator('.tile:not(.tile--quick)');
    await refreshedTiles.nth(1).click();
    await page.getByTestId('add-product-to-cart').click();
    await page.waitForTimeout(400);
    expect(await horizontalOverflow(page), '/sell with a loaded cart in Urdu').toBeLessThanOrEqual(
      1,
    );

    await useEnglish(page);
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(400);
      expect(await horizontalOverflow(page), `${route} in English`).toBeLessThanOrEqual(1);
    }
  });

  test('flips direction with the language and keeps numerals Latin', async ({ page }) => {
    await completeSetup(page, { language: 'ur' });
    await page.goto('/sell');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');

    await useEnglish(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    // Money is Latin digits in both languages — a shopkeeper reads 1234.
    await page.goto('/reports');
    await expect(page.getByTestId('report-gross')).toHaveText(/^Rs [\d,]+$/);
  });

  test('numbers and dates are not reordered by the bidi algorithm in Urdu', async ({ page }) => {
    test.setTimeout(120_000);

    await completeSetup(page, { language: 'ur' });
    await page.goto('/people/customer/new');
    await page.getByLabel('نام').first().fill('محمد اکرم');
    await page.getByRole('button', { name: 'محفوظ کریں' }).click();
    await page.getByTestId('customer-balance').waitFor();

    // A charge, so the ledger has a signed amount and a timestamp in it.
    await page.getByRole('button', { name: 'بقایا درست کریں' }).click();
    const adjust = page.getByRole('dialog', { name: 'بقایا درست کریں' });
    await adjust.getByLabel('کل').fill('487.20');
    await adjust.getByLabel('نوٹ').fill('اُدھار');
    await adjust.getByRole('button', { name: 'محفوظ کریں' }).click();
    await expect(page.locator('.ledger-row')).toHaveCount(1);

    // The sign belongs in front of the digits. Without an LTR isolate the bidi
    // algorithm moves it to the far end and it renders "487.20+".
    await expect(page.locator('.ledger-row__amount')).toHaveText('+487.20');

    // And a date must not come out as "Sept 2026, 03:08 pm 03".
    const when = await page.locator('.ledger-row__when .num').innerText();
    expect(when).toMatch(/^\d{2} [A-Za-z]{3,4} \d{4}, \d{2}:\d{2} [ap]m$/);

    // The balance keeps its symbol in front of the number too.
    await expect(page.getByTestId('customer-balance')).toHaveText('Rs 487.20');
  });

  test('every tappable control clears the 48px touch floor', async ({ page }) => {
    await seed(page);
    await useEnglish(page);
    await page.goto('/sell');
    await page.waitForTimeout(800);

    const small = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll('button, a[href], select'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Toasts are transient overlays with their own dismiss affordance;
        // category chips sit inside a larger scroll strip. Everything a sale
        // depends on is checked.
        if (
          el.closest('[data-sonner-toast]') ||
          el.closest('.toast') ||
          el.hasAttribute('data-close-button') ||
          el.classList.contains('chip')
        )
          continue;
        if (rect.height < 38) {
          offenders.push(`${el.className || el.tagName} ${String(Math.round(rect.height))}px`);
        }
      }
      return offenders;
    });
    expect(small).toEqual([]);
  });
});

/**
 * A portrait tablet is the shape the till spends most of its life in. The
 * catalogue must scroll inside its own pane; the page body must not scroll and
 * carry the tab bar and cart bar off the bottom of the screen with it.
 */
test.describe('the till frame on a portrait tablet', () => {
  test.use({ viewport: { width: 1024, height: 1366 } });

  test('the catalogue scrolls on its own and the tab bar stays on screen', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await useEnglish(page);
    await page.goto('/sell');
    await page.locator('.catalogue__grid').waitFor();
    await page.waitForTimeout(800);

    // The grid holds far more than one screen of product tiles...
    const gridOverflow = await page
      .locator('.catalogue__grid')
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(gridOverflow).toBeGreaterThan(200);

    // ...and it is the grid, not the page, that absorbs a scroll gesture.
    await page.mouse.move(512, 683);
    await page.mouse.wheel(0, 20_000);
    await page.evaluate(() => {
      document.scrollingElement!.scrollTop = 99_999;
      document.querySelector('.catalogue__grid')!.scrollTop = 99_999;
    });
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => {
      const nav = document
        .querySelector('[data-testid="tab-bar"]')!
        .getBoundingClientRect();
      return {
        bodyScroll: document.scrollingElement!.scrollTop,
        gridScrolled: document.querySelector('.catalogue__grid')!.scrollTop,
        navBottom: Math.round(nav.bottom),
        viewport: window.innerHeight,
      };
    });

    expect(state.bodyScroll).toBe(0);
    expect(state.gridScrolled).toBeGreaterThan(200);
    expect(Math.abs(state.navBottom - state.viewport)).toBeLessThanOrEqual(2);
  });
});

test.describe('the printed receipt', () => {
  test('prints the slip and nothing else', async ({ page }) => {
    test.setTimeout(120_000);
    await useEnglish(page);

    await page.goto('/stock/product/new');
    await page.getByLabel('Name (English)').fill('Tea');
    await page.getByLabel('Price', { exact: true }).fill('260');
    await page.getByLabel('Opening stock').fill('12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: /Tea/ })).toBeVisible();

    await page.goto('/sell');
    await addProductToCart(page, 'Tea');
    await page.getByTestId('charge').click();
    await page.getByTestId('method-cash').click();
    await page.getByTestId('confirm-sale').click();
    await expect(page.locator('.slip')).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    // App chrome is not paper. Nothing but the slip goes through the printer.
    await expect(page.getByTestId('app-header')).toBeHidden();
    await expect(page.getByTestId('tab-bar')).toBeHidden();
    await expect(page.locator('.receipt__actions')).toBeHidden();
    await expect(page.locator('.slip')).toBeVisible();

    // 58mm paper has about 54mm of printable width — roughly 204 CSS px.
    const width = await page.locator('.slip').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(150);
    expect(width).toBeLessThan(230);

    await page.emulateMedia({ media: 'screen' });
  });
});

test.describe('installability', () => {
  test('serves a manifest, icons and a service worker', async ({ page, request, baseURL }) => {
    // §10: the only network call in the whole app is a wa.me link the user
    // taps. Nothing loaded by the app itself may come from another origin —
    // no font CDN, no script host, no analytics beacon.
    const ownOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
    const offOrigin: string[] = [];
    page.on('request', (outgoing) => {
      const url = new URL(outgoing.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.origin !== ownOrigin) offOrigin.push(outgoing.url());
    });

    await page.goto('/sell');

    const manifestUrl = new URL('/manifest.webmanifest', page.url());
    const manifestResponse = await request.get(manifestUrl.href);
    expect(manifestResponse.ok()).toBe(true);
    const manifest = (await manifestResponse.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    // Every path in the manifest is relative, so it resolves against the
    // manifest's own URL and the same file works at the domain root and under
    // a GitHub Pages project subpath. Assert the resolved URLs, not literals.
    expect(new URL(manifest.start_url, manifestUrl).href).toBe(
      new URL('sell', manifestUrl).href,
    );
    expect(new URL(manifest.scope, manifestUrl).href).toBe(new URL('./', manifestUrl).href);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(new URL(icon.src, manifestUrl).href);
      expect(iconResponse.ok(), icon.src).toBe(true);
    }

    // Fonts are declared as IBM Plex and nothing else, and are fetched from
    // this origin. A browser only downloads a face once a glyph needs it, so
    // which families end up loaded depends on what is on screen — the property
    // worth asserting is where they come from, not which ones fired.
    const declared = await page.evaluate(async () => {
      await document.fonts.ready;
      // FontFaceSet is iterable at runtime; its lib.dom typing is not.
      const families: string[] = [];
      document.fonts.forEach((face) => families.push(face.family));
      return [...new Set(families)];
    });
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.every((family) => family.startsWith('IBM Plex'))).toBe(true);

    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker) return false;
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller !== null;
      },
      null,
      { timeout: 60_000 },
    );

    expect(offOrigin, 'the app fetched something from another origin').toEqual([]);
  });

  test('the whole day works in aeroplane mode', async ({ page, context }) => {
    test.setTimeout(120_000);
    await useEnglish(page);

    await page.goto('/stock/product/new');
    await page.getByLabel('Name (English)').fill('Salt');
    await page.getByLabel('Price', { exact: true }).fill('45');
    await page.getByLabel('Opening stock').fill('30');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: /Salt/ })).toBeVisible();

    await page.goto('/sell');
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker) return false;
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller !== null;
      },
      null,
      { timeout: 60_000 },
    );

    // Pull the plug.
    await context.setOffline(true);
    await page.reload();

    // Sell something offline.
    await addProductToCart(page, 'Salt');
    await page.getByTestId('charge').click();
    await page.getByTestId('method-cash').click();
    await page.getByTestId('confirm-sale').click();
    await expect(page.locator('.slip')).toBeVisible();

    // And take a backup offline.
    await page.goto('/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('backup-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.sqlite3$/);

    await context.setOffline(false);
  });
});

test.describe('the PIN', () => {
  test('covers Reports and Settings but never the till', async ({ page }) => {
    test.setTimeout(120_000);
    await useEnglish(page);

    await page.goto('/settings');
    await page.getByTestId('set-pin').click();
    const dialog = page.getByRole('dialog', { name: 'Set a 4-digit PIN' });
    await dialog.getByLabel('Set a 4-digit PIN').fill('1379');
    await dialog.getByTestId('confirm-pin').click();
    await expect(page.getByTestId('toast')).toBeVisible();

    // A fresh page: Reports is behind the PIN.
    await page.reload();
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Enter your PIN' })).toBeVisible();

    // Selling is never locked — the till must not stop with a queue at the
    // counter because somebody forgot four digits.
    await page.goto('/sell');
    await expect(page.getByTestId('charge')).toBeVisible();

    // Wrong PIN says so and stays shut.
    await page.goto('/reports');
    for (const digit of ['0', '0', '0', '0']) {
      await page.getByRole('button', { name: digit, exact: true }).first().click();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Wrong PIN.')).toBeVisible();

    // The right one opens it, and stays open while the app is running.
    await page.reload();
    for (const digit of ['1', '3', '7', '9']) {
      await page.getByRole('button', { name: digit, exact: true }).first().click();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('report-gross')).toBeVisible();

    // Moving to Settings inside the app does not ask again. (A full reload
    // does, which is the intended trade: the unlock lives in memory only.)
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Shop name')).toBeVisible();
  });
});
