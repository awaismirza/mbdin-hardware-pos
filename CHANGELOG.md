# Changelog

All notable, user-facing changes to Dukaan POS. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version shown in **Settings → About** is `package.json`'s `version`. Cutting
a release moves the `[Unreleased]` items into a dated section — see
[`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

_Nothing yet._

## [1.0.0] — 2026-09-04

First tagged release. Everything below is what the app does today.

### Added

- **Sell** — searchable catalogue with product photos; tap a tile to open an
  add-to-cart sheet with a quantity stepper and live line total (fractional
  quantities for weighed goods); cart as a right-hand pane in landscape or a
  bottom drawer on a phone; per-line price override and cart discount; checkout
  sheet with cash / udhaar / Easypaisa / JazzCash / bank, change and part-payment
  maths; printable 58 mm receipt and a `wa.me` share; held carts; quick-sell for
  unlisted items; camera + USB barcode scanning.
- **Stock** — product list with photos, low/out badges and a summary bar; product
  detail with receive-stock and stock-take, and a movement history; two-column
  editor; CSV import with column mapping and a preview.
- **Customers** — directory with per-customer balance state; customer photos; a
  running udhaar ledger; take-payment and manual balance adjustment; call / SMS /
  WhatsApp reminder shortcuts.
- **Reports** — today / yesterday / week / month / custom range; takings hero,
  day-bars, cash / credit / payments / discount / estimated profit; top products
  by revenue and by quantity; outstanding total with a debtors list; low-stock
  list. CSV export of the range. Behind the optional PIN.
- **Settings** — shop details for the receipt; language (English / Urdu); theme
  (light / dark / system); Android install prompt; optional 4-digit PIN over
  Reports and Settings; storage diagnostics; **About** card showing the version
  and build date.
- **Backup & restore** — export the whole database as one `.sqlite3` file, a
  portable `.json` file, or per-table CSVs; share via the system sheet or
  download. Restore replaces the ledger from a `.sqlite3` or `.json` file, always
  after an automatic pre-restore safety copy, and refuses a truncated or foreign
  file by name. Product and customer photos are carried in both `.sqlite3` and
  `.json` backups.
- **On-device archive** — a rolling folder of the last 14 database copies plus a
  daily automatic one and the pre-restore copy (OPFS only).
- **Offline PWA** — installs to the home screen; the whole shell, the SQLite WASM
  binary and the fonts are precached; nothing needs the network once loaded
  (only user-tapped `wa.me` links leave the app). Works at the domain root and
  under a GitHub Pages project subpath.
- **First-run setup** — a new ledger opens a short setup screen; English is the
  default, only the shop name is required.
- **Storage** — SQLite WASM on the `opfs-sahpool` VFS inside a Web Worker is the
  source of truth; an IndexedDB fallback runs the same build for browsers with no
  OPFS. Money is integer paisa. A sale is one transaction. A customer's balance
  is always `SUM(ledger_entries.amount_paisa)`.

### Design

- Full view layer on Tailwind v4 + shadcn/ui, light and dark, Urdu / RTL
  first-class. App shell is one flex column pinned to the visual viewport — the
  routed screen owns the only scroll container, which is what makes iOS Safari
  behave — with a bottom tab bar on a phone and a left rail in landscape.

### Notes for the record (pre-1.0 history)

M1 storage layer → M2 products & photos → M3 sell flow → M4 customers & udhaar →
M5 backup/archive/restore → M6 reports → M7 PWA polish, PIN & design pass →
GitHub Pages deploy under a subpath → home-screen install detection →
selling / stock / customers / onboarding pass → portrait-tablet scroll fixes →
the shadcn redesign → the backup/restore robustness pass.

[Unreleased]: https://github.com/awaismirza/mbdin-hardware-pos/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/awaismirza/mbdin-hardware-pos/releases/tag/v1.0.0
