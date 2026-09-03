# Dukaan

An offline point of sale and **udhaar** ledger for a single general store, built
as a progressive web app. Open the link once, add it to the home screen, and it
launches like an app and works with no internet at all.

There is no server, no login, no account, no subscription and no analytics. If
the shop's internet is down for a week, nothing changes.

- **Sell** — scan or tap items into a cart, take cash or udhaar, print or send a receipt.
- **Stock** — add products, receive stock, count stock, see what is running low.
- **People** — a phone book and a running credit ledger per customer.
- **Archive** — export the whole database as one file; restore from one.
- **Report** — today's takings, this month's, what is selling, who owes money.

---

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
npm test           # unit and integration tests
npm run test:e2e   # Playwright, against a production build
npm run typecheck
npm run lint
```

`dist/` is a folder of static files. It needs no server-side rendering, no
environment variables and no special response headers — drop it on any static
host.

`npm run test:e2e` uses Playwright's own Chromium. If your environment ships one
already, point at it: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

---

## How it stores the shop's book

This is the part worth reading carefully, because it is where an app like this
can actually lose someone's ledger.

The database is a real SQLite file inside the browser's Origin Private File
System, opened in a dedicated Web Worker. React components call repositories,
repositories call the worker, and only the worker touches SQL.

**The OPFS variant is `opfs-sahpool`, deliberately.** SQLite's WASM build offers
two OPFS backends:

| VFS | How it works | Needs COOP/COEP? |
|---|---|---|
| `opfs` (`sqlite3.oo1.OpfsDb`) | Async proxy driven by `Atomics.wait` on a `SharedArrayBuffer` | **Yes** |
| `opfs-sahpool` (`installOpfsSAHPoolVfs`) | A pool of OPFS sync access handles, driven synchronously in the worker | **No** |

Because the app must deploy to any static host, it uses `opfs-sahpool`. The
build has been verified on a host that sends no cross-origin isolation headers:
the classic `opfs` VFS declines to install there ("Missing SharedArrayBuffer
and/or Atomics"), and `opfs-sahpool` opens normally.

The trade-offs of `opfs-sahpool` are a single connection at a time and files
stored under opaque pool names. Both are fine here — one shop, one tablet, one
tab — and backups are produced with `sqlite3_js_db_export()` rather than by
reading the file.

**Access handles are exclusive, and that matters.** On a reload, the outgoing
page can still hold the pool for a few hundred milliseconds. The worker retries
while the pool is merely busy, and if it stays busy it raises an error rather
than falling back — falling back would open the *IndexedDB* database instead,
which is a different, empty book, and would look exactly like a lost ledger. The
client also terminates the worker on `pagehide` so handles are released before
the next boot.

**The fallback** is for browsers with no OPFS at all. It runs the same WASM
build against an in-memory database and rewrites the serialised image into
IndexedDB after every write transaction. Settings shows which path is live, and
**Settings → Storage check** lets you force either one to verify both work on a
given device. Note that each path keeps its own separate database, so switching
looks like an empty shop; switch back when you have finished checking.

### Durability, honestly

- On first boot the app calls `navigator.storage.persist()`. Chrome grants it to
  installed apps. **Safari does not implement it**, and evicts data from sites
  not on the home screen after about seven days of disuse.
- Adding Dukaan to the iOS home screen is therefore not cosmetic — it is what
  stops Safari clearing the ledger.
- Nothing above is a substitute for the daily backup. That is why the app nags
  when the last off-device backup is over 24 hours old.

---

## Design

The reference is the **bahi khata**, the cloth-bound ledger under the counter of
every shop in Punjab: ruled columns, ink on faintly green paper, a red spine, and
numbers in disciplined vertical stacks. So the app is built from ruled lines
rather than floating cards, and one red (`--seal`) appears only where money
changes hands. One loud element per screen — the running total on Sell, the
balance on a customer, today's takings on Reports — and everything else quiet.

All tokens live in `src/styles/tokens.css`. Nothing hard-codes a colour or a
font size.

**Dark mode is deliberately out of scope.** The tablet sits under shop lighting
by a shop front all day and never sees a dark room; a second theme would be
surface area with no user.

**Urdu is set in Naskh, not Nastaliq.** Nastaliq is the beautiful and culturally
correct script, but at 14–16 px on a cheap tablet it is unreadable, and the line
height it demands wrecks dense list rows. Naskh is the right compromise for
interface chrome. If a future version wants Nastaliq, it belongs on the printed
receipt, not on the buttons.

Numerals stay Latin (`1234`) in both languages. Shopkeepers read Latin digits;
Eastern Arabic numerals would be a mistake here.

**Every figure and timestamp is an LTR island** (`direction: ltr;
unicode-bidi: isolate`). This is load-bearing, not tidiness. Inside an RTL
paragraph the bidi algorithm treats a leading `+`, the `Rs`, and the separators
in a date as neutral characters and reorders them around the digits: a ledger
entry written `+487.20` renders as `487.20+`, and `03 Sept 2026, 03:11 pm`
renders as `Sept 2026, 03:11 pm 03`. Both were real, and both are covered by a
test. The element's *box* is still placed by the RTL flow; only its contents are
isolated.

Money is right-aligned in every context, in both directions, so a column of
figures lines up on its last digit and the eye can run down it.

Fonts are self-hosted in `public/fonts` and copied from the Fontsource packages
by `npm run fonts` (also wired into `prebuild`). The app never touches a font
CDN, because it is expected to cold-launch in aeroplane mode.

> **The Urdu strings need a human pass before this ships.** `src/i18n/ur.ts` is
> written in plain shop Urdu, but a money app deserves a native speaker reading
> every line aloud before it goes on a counter.

---

## The PIN

Settings and Reports can be put behind an optional 4-digit PIN. Selling, stock
and the customer ledger never are — the till must not stop with a queue at the
counter because somebody forgot four digits.

**It is not security and the app says so.** Anyone holding the tablet can read
the database through devtools; four digits is 10,000 guesses; there is no rate
limiting because there is no server to enforce one. It exists to stop a customer
leaning over the counter and reading the day's takings. It is stored hashed only
so that a backup opened in a text editor does not reveal a PIN the shopkeeper
has very likely also used on something that matters.

---

## Size

    initial JS        ~100 KB gzipped   (budget: 250 KB)
    initial CSS       ~6 KB gzipped
    SQLite WASM       ~840 KB           (precached, loaded in the worker)
    fonts             ~210 KB           (two families, subset, self-hosted)
    ZXing             ~109 KB gzipped   (loaded only when the scanner opens)

---

## Tests

    96 unit and integration tests   paisa arithmetic, CSV, dates, and the
                                    repositories against a real in-memory SQLite
    27 browser tests                both storage paths, offline cold boot, the
                                    sale transaction, a tab kill mid-cart, the
                                    udhaar ledger, backup/restore round trips,
                                    report reconciliation, RTL, and the PIN

`tests/e2e/a-day-in-the-shop.spec.ts` is the whole day in one script, driven
entirely through the Urdu interface, right to left: add a product, sell for
cash, sell on credit, take a payment, export, reset, restore, and check every
total came back.

---

## Manual checklist before a release

Automated tests do not cover these. Run them on the real devices.

- [ ] **Android install** — Chrome offers "Install app"; the icon lands on the home screen and launches without browser chrome.
- [ ] **iOS home screen** — Safari → Share → Add to Home Screen. Launches standalone. (There is no install prompt on iOS; the app explains this in Settings.)
- [ ] **Aeroplane mode** — turn the network off, cold-launch from the home screen, complete a sale, take a payment, export a backup.
- [ ] **Hard kill mid-sale** — put items in the cart, force-quit the app, reopen. The cart comes back.
- [ ] **Thermal print** — print a receipt to a 58 mm printer; amounts line up in a mono column and nothing is clipped.
- [ ] **WhatsApp share** — send a receipt and a backup file through the share sheet.
- [ ] **USB barcode scanner** — it behaves as a keyboard: scanning into the search field and pressing Enter adds the item.
- [ ] **Camera** — barcode scan and a product photo, on both Android Chrome and iOS Safari, and in the installed app rather than only in a browser tab.
- [ ] **Daylight** — read the screen at the shop front at midday.
- [ ] **RTL** — walk the whole app in Urdu; nothing is mirrored wrongly and no money column loses its right alignment.

---

## Out of scope for v1

Deliberately not built, so nobody adds them by accident: multi-device sync,
multi-user accounts and roles, supplier and purchase-order management, GST/FBR
tax invoicing, loyalty points, cloud hosting of any kind, a native app wrapper,
and merge-on-restore conflict resolution.

On that last one: restore **replaces**, it does not merge. One shop, one device.
