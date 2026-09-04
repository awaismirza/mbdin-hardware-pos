# Dukaan POS — product spec

**Version:** 1.1.0
**Status:** snapshot — immutable. The current spec is `docs/product-spec.md`.
**Stable path:** this file. Every version is snapshotted to
`docs/specs/product-spec-v<version>.md` at release time; spec bumps are logged in
`docs/spec-changelog.md`. Narrative detail and the manual pre-release checklist
live in [`README.md`](../README.md); engineering non-negotiables in
[`CLAUDE.md`](../CLAUDE.md).

---

## 1. What it is

An offline-first PWA point of sale and udhaar (credit) ledger for **one shop, one
device**, in Pakistan. No backend, no accounts, no analytics. It must keep
working with the shop's internet down for a week.

## 2. Who and where

A shopkeeper on a cheap Android tablet or a phone, behind a counter, one thumb
free, a queue waiting. English or Urdu (RTL). Installed to the home screen.

## 3. Non-negotiables (also in CLAUDE.md)

- Money is integer **paisa**, never a float. Formatted only at render.
- Every mutation goes through a repository in `src/db/repos/`. No SQL in
  components.
- Completing a sale is **one transaction** — all or nothing.
- Nothing requires the network. User-tapped `wa.me` links are the only exception.
- A customer's balance is always `SUM(ledger_entries.amount_paisa)` — never
  denormalised.
- The app never silently opens a different database.
- Numbers and dates are isolated LTR runs (`.num` / `.money`) so the bidi
  algorithm does not reorder signs and separators in Urdu.
- Reports and Settings sit behind the optional PIN; Sell, Stock and Customers
  never do — the till must not lock mid-queue.

## 4. Capabilities

### Sell
Searchable photo catalogue → tap a tile → add-to-cart sheet (quantity stepper,
live line total; fractional quantities for weighed units). Cart is a right pane
in landscape, a bottom drawer on a phone. Per-line price override, cart discount
(rupees or percent). Checkout: cash / udhaar / Easypaisa / JazzCash / bank, with
change and part-payment maths; a part-paid credit sale records as `mixed` so the
cash figure stays right. 58 mm printable receipt + `wa.me` share. Quick-sell for
unlisted items. Camera and USB-keyboard barcode scanning; the search field is
never autofocused (it raises the keyboard on a tablet).

**Multiple carts.** A busy counter serves several customers at once, so the Sell
screen carries cart tabs — tap to switch, `+` to open one, `×` to close one
(with a confirm when it has items). Each cart is an independent `kind='active'`
row in `held_carts` with its own lines, customer and discount, written after
every change, so a power cut or a killed tab loses none of them; they ride in a
backup too. There is always at least one cart. Completing a sale clears only the
cart it was rung from — inside the same transaction — and drops the shopkeeper
onto the next open cart. There is no separate "hold" concept: parking a basket
is just another tab.

### Stock
Product list with photos, low/out flags, a summary bar. Product detail: quantity
hero, price/cost/margin, receive-stock and stock-take (each writes a
`stock_movements` row), movement history. Two-column editor (one column on a
phone). CSV import with guessed column mapping, a 5-row preview, and honest
skipped-row reporting; re-import matches on barcode then SKU.

### Customers
Directory sorted by who owes most. Per-customer photo, phone, address, notes,
optional credit limit (warns, never blocks). Running ledger with a per-row
running balance. Take-payment and manual balance adjustment (adjustment needs a
note). Call / SMS / WhatsApp-reminder shortcuts. Route stays `/people`; all
visible copy says "Customers".

### Reports (behind PIN)
Range: today / yesterday / week / month / custom. Takings hero, day-bars, cash /
credit given / payments received / discount / estimated profit (selling price
less cost snapshot) / average basket. Top products by revenue and by quantity.
Outstanding total + debtors list. Low-stock list. CSV export of the range, money
in rupees. When **hide profit** is on (see Settings) the estimated-profit figure
renders masked as `••••`; the CSV still carries the real number — it is an
export of the shopkeeper's own data, not a screen.

### Settings (behind PIN, except first run)
Shop details for the receipt; appearance (theme swatches + language); install;
optional 4-digit PIN; a **Privacy** toggle — *hide profit in Reports* — that is
itself gated by the PIN, so an assistant already past the Settings gate still
cannot flip it without the number (if no PIN is set it just toggles);
automatic-backup folder where the browser supports one; **About** (version +
build date); a link to storage diagnostics.

### Install (never behind the PIN)
A bar appears whenever the app is running in a browser tab, offering the install
directly on browsers that expose `beforeinstallprompt`, and otherwise leading to
`/install`. That screen detects the platform and gives the real gesture for it —
iOS Safari's Share sheet, Android's browser menu, the desktop address-bar icon,
Safari's Add to Dock — and says plainly that Chrome and Firefox on iOS cannot
install at all, because they are Safari underneath. It also reports whether the
browser has granted persistent storage. Dismissal snoozes until the next Karachi
day; it is never a permanent mute.

### Backup & restore
Export: one `.sqlite3` (byte-exact), one portable `.json` (every table +
`schemaVersion`, BLOBs base64), or per-table CSVs. Share via the system sheet or
download. Restore **replaces** the ledger (never merges) from a `.sqlite3` or
`.json` file, always after an automatic pre-restore safety copy; a truncated or
foreign file is refused by name. **Product and customer photos are carried in
both `.sqlite3` and `.json`.** On-device archive keeps the last 14 copies plus a
daily automatic one (OPFS only).

**Automatic daily export** to a folder the shopkeeper picks, on browsers that
implement the File System Access API (desktop Chromium today). Point it at a
folder a cloud client syncs and the copy leaves the device unattended. No browser
on a phone or tablet can do this and none can reach iCloud Drive or Google Drive
in the background; there the daily reminder plus the share sheet is the answer,
and the UI says so rather than offering a switch that would do nothing. See
`docs/auto-backup.md`.

### First run
A new ledger shows a setup screen. English default; only the shop name is
required. An existing shop with a name is never sent back through setup. A reset
returns to first run.

## 5. Storage

SQLite WASM on the **`opfs-sahpool`** VFS inside a Web Worker is the source of
truth — it needs no COOP/COEP headers, so the app deploys to any static host.
IndexedDB fallback runs the same WASM build in memory and rewrites the serialised
image after every write transaction, for browsers with no OPFS. `src/db/repos/`
is the only application-level SQL boundary; `src/db/worker.ts` owns the
connection. Schema changes are new numbered migrations — an existing migration is
never edited.

## 6. Platform

React + TypeScript + Vite. Tailwind v4 + shadcn/ui for the view layer, built to
`docs/design-spec.md` — cobalt accent, IBM Plex Mono for every numeral, both
themes, RTL first-class via logical properties. The app shell is one flex box
pinned to the visual viewport with the navigation as a flex child (sidebar at
`lg`, icon rail at `md`, tab bar below); the routed screen owns the only scroll
container.
Service worker precaches the shell, the WASM binary and the fonts; updates apply
on the next cold start (no interrupting prompt). Works at the domain root and
under a GitHub Pages project subpath — no root-absolute URLs.

## 7. Out of scope

A backend, accounts, analytics. Multi-device sync / ledger merging. Anything that
needs the network to complete.
