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

/**
 * The worst sideways overflow of any inner scroll region. The document itself
 * can read 0 while a screen's `overflow-y-auto` region scrolls sideways inside
 * it — which is exactly how the Settings two-column grid regressed once.
 */
async function regionHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    let worst = 0;
    const regions = Array.from(
      document.querySelectorAll('.overflow-y-auto, [data-testid="catalogue-scroll"]'),
    );
    for (const el of regions) {
      worst = Math.max(worst, el.scrollWidth - el.clientWidth);
    }
    return worst;
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
    const tiles = page.locator('[data-testid="product-tile"]');
    await tiles.nth(0).click();
    await page.getByTestId('add-product-to-cart').click();
    await page.goto('/sell');
    await page.waitForTimeout(400);
    const refreshedTiles = page.locator('[data-testid="product-tile"]');
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

  test('no inner scroll region scrolls sideways on a narrow phone', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 720 });
    await completeSetup(page);
    await seed(page);

    // Settings is the one that regressed: a CSS grid with no mobile column
    // sized itself to its widest child instead of the viewport.
    for (const route of ['/settings', '/reports', '/people', '/stock', '/sell']) {
      await page.goto(route);
      await page.waitForTimeout(400);
      expect(await regionHorizontalOverflow(page), `scroll region on ${route}`).toBeLessThanOrEqual(
        1,
      );
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

  /*
   * Two floors, per the design spec (§4): nothing tappable anywhere falls below
   * 34px, and the controls a sale actually passes through are 44px or more.
   * The second is the one that matters at a counter — the first only keeps
   * secondary chrome from shrinking to a pinprick.
   */
  test('every tappable control clears the 34px touch floor', async ({ page }) => {
    await seed(page);
    await useEnglish(page);
    await page.goto('/sell');
    await page.waitForTimeout(800);

    const small = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll('button, a[href], select'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Toasts are transient overlays with their own dismiss affordance.
        if (
          el.closest('[data-sonner-toast]') ||
          el.closest('.toast') ||
          el.hasAttribute('data-close-button')
        )
          continue;
        if (rect.height < 34) {
          offenders.push(`${el.className || el.tagName} ${String(Math.round(rect.height))}px`);
        }
      }
      return offenders;
    });
    expect(small).toEqual([]);
  });

  test('the controls a sale passes through clear 44px', async ({ page }) => {
    // A cart line enters with a `scale(.97)`, which measures 43px instead of 44
    // if the read lands mid-animation. Reduced motion removes it — and doubles
    // as a check that the reduced-motion path actually suppresses animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seed(page);
    await useEnglish(page);
    await page.goto('/sell');

    // Any product will do — this is about the size of the controls, not which
    // item is being sold.
    await page.getByTestId('product-tile').first().click();
    await page.getByTestId('product-quantity').fill('1');
    await page.getByTestId('add-product-to-cart').click();
    await expect(page.getByTestId('cart-line')).toBeVisible();

    const heights = await page.evaluate(() => {
      const pick = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
      };
      return {
        tile: pick('[data-testid="product-tile"]'),
        charge: pick('[data-testid="charge"]'),
        stepper: pick('[data-testid="cart-line"] button[aria-label="+"]'),
      };
    });

    expect(heights.tile).toBeGreaterThanOrEqual(44);
    expect(heights.charge).toBeGreaterThanOrEqual(44);
    expect(heights.stepper).toBeGreaterThanOrEqual(44);
  });
});

/**
 * A portrait tablet is the shape the till spends most of its life in. The
 * catalogue must scroll inside its own pane; the page body must not scroll and
 * carry the tab bar and cart bar off the bottom of the screen with it.
 */
test.describe('the till frame on a portrait tablet', () => {
  // 900px wide: past the 768px rail breakpoint, short of the 1024px sidebar,
  // which is the shape a 10-inch tablet held upright actually reports.
  test.use({ viewport: { width: 900, height: 1366 } });

  test('the catalogue scrolls on its own and the chrome stays on screen', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await useEnglish(page);
    await page.goto('/sell');
    await page.locator('[data-testid="catalogue-scroll"]').waitFor();
    await page.waitForTimeout(800);

    // The grid holds far more than one screen of product tiles...
    const gridOverflow = await page
      .locator('[data-testid="catalogue-scroll"]')
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(gridOverflow).toBeGreaterThan(200);

    // ...and it is the grid, not the page, that absorbs a scroll gesture.
    await page.mouse.move(450, 683);
    await page.mouse.wheel(0, 20_000);
    await page.evaluate(() => {
      document.scrollingElement!.scrollTop = 99_999;
      document.querySelector('[data-testid="catalogue-scroll"]')!.scrollTop = 99_999;
    });
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => {
      // Whichever nav this width gets — the rail at `md`, the tab bar below —
      // it is part of the frame and cannot be scrolled away.
      const nav =
        document.querySelector('[data-testid="side-rail"]') ??
        document.querySelector('[data-testid="tab-bar"]')!;
      const cartBar = document.querySelector('[data-testid="cart-bar"]')!.getBoundingClientRect();
      return {
        bodyScroll: document.scrollingElement!.scrollTop,
        gridScrolled: document.querySelector('[data-testid="catalogue-scroll"]')!.scrollTop,
        navBottom: Math.round(nav.getBoundingClientRect().bottom),
        cartBarBottom: Math.round(cartBar.bottom),
        viewport: window.innerHeight,
      };
    });

    expect(state.bodyScroll).toBe(0);
    expect(state.gridScrolled).toBeGreaterThan(200);
    expect(Math.abs(state.navBottom - state.viewport)).toBeLessThanOrEqual(2);
    // The cart bar is the last thing above the tab bar and the first casualty
    // when the page itself starts scrolling — so it is the real canary.
    expect(state.cartBarBottom).toBeLessThanOrEqual(state.viewport + 2);
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

    // App chrome is not paper. Nothing but the slip goes through the printer —
    // including the on-screen success card the slip is nested inside.
    await expect(page.getByTestId('app-header')).toBeHidden();
    await expect(page.getByTestId('tab-bar')).toBeHidden();
    await expect(page.locator('.receipt__actions')).toBeHidden();
    await expect(page.locator('.receipt__success')).toBeHidden();
    await expect(page.locator('.receipt__success').getByText('Sale saved')).toBeHidden();
    await expect(page.locator('.slip')).toBeVisible();

    // The slip sits flush at the start edge, 58mm wide at most, and NOTHING
    // inside it runs off the right — the bug this guards against printed the
    // slip shifted right by an ancestor's padding so amounts were cut off.
    const box = await page.evaluate(() => {
      const slip = document.querySelector('.slip')!.getBoundingClientRect();
      const pageWidthPx = (58 * 96) / 25.4; // 58mm at 96dpi ≈ 219
      let widest = slip.right;
      for (const el of Array.from(document.querySelectorAll('.slip *'))) {
        widest = Math.max(widest, el.getBoundingClientRect().right);
      }
      return { left: slip.left, width: slip.width, widest, pageWidthPx };
    });
    expect(box.left).toBeLessThanOrEqual(2);
    expect(box.width).toBeGreaterThan(150);
    expect(box.width).toBeLessThanOrEqual(box.pageWidthPx);
    expect(box.widest).toBeLessThanOrEqual(box.pageWidthPx + 1);

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

    // The three self-hosted families and nothing else, all fetched from this
    // origin. A browser only downloads a face once a glyph needs it, so which
    // families end up loaded depends on what is on screen — the property worth
    // asserting is where they come from, not which ones fired.
    const ALLOWED = new Set(['Plus Jakarta Sans', 'IBM Plex Mono', 'IBM Plex Sans Arabic']);
    const declared = await page.evaluate(async () => {
      await document.fonts.ready;
      // FontFaceSet is iterable at runtime; its lib.dom typing is not.
      const families: string[] = [];
      document.fonts.forEach((face) => families.push(face.family));
      return [...new Set(families)];
    });
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((family) => !ALLOWED.has(family))).toEqual([]);

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
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByLabel('Shop name')).toBeVisible();
  });
});
