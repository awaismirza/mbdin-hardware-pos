# Dukaan POS — product spec

**Version:** 1.0.0
**Status:** current
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
cash figure stays right. 58 mm printable receipt + `wa.me` share. Held carts.
Quick-sell for unlisted items. Camera and USB-keyboard barcode scanning; the
search field is never autofocused (it raises the keyboard on a tablet).

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
less cost snapshot). Top products by revenue and by quantity. Outstanding total +
debtors list. Low-stock list. CSV export of the range, money in rupees.

### Settings (behind PIN, except first run)
Shop details for the receipt; language; theme (light / dark / system); Android
install prompt; optional 4-digit PIN; **About** (version + build date); a link to
storage diagnostics.

### Backup & restore
Export: one `.sqlite3` (byte-exact), one portable `.json` (every table +
`schemaVersion`, BLOBs base64), or per-table CSVs. Share via the system sheet or
download. Restore **replaces** the ledger (never merges) from a `.sqlite3` or
`.json` file, always after an automatic pre-restore safety copy; a truncated or
foreign file is refused by name. **Product and customer photos are carried in
both `.sqlite3` and `.json`.** On-device archive keeps the last 14 copies plus a
daily automatic one (OPFS only).

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

React + TypeScript + Vite. Tailwind v4 + shadcn/ui for the view layer, light and
dark, RTL first-class via logical properties. The app shell is one flex column
pinned to the visual viewport; the routed screen owns the only scroll container.
Service worker precaches the shell, the WASM binary and the fonts; updates apply
on the next cold start (no interrupting prompt). Works at the domain root and
under a GitHub Pages project subpath — no root-absolute URLs.

## 7. Out of scope

A backend, accounts, analytics. Multi-device sync / ledger merging. Anything that
needs the network to complete.
