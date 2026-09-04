# Changelog

All notable, user-facing changes to Dukaan POS. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version shown in **Settings → About** is `package.json`'s `version`. Cutting
a release moves the `[Unreleased]` items into a dated section — see
[`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

### Changed

- **Complete visual redesign** to the cobalt design system in
  [`docs/design-spec.md`](docs/design-spec.md). Cards on cool grey instead of
  ruled paper; one cobalt accent carrying every primary action and active state;
  red reserved for money owed, out-of-stock and destructive actions; generous
  radii and ambient shadow. Both themes ship — "Daylight" and "Night" — and the
  choice persists.
- **Every numeral is now IBM Plex Mono with tabular figures** — amounts,
  quantities, dates, phone numbers, SKUs — so a column of figures never shifts
  as the digits change. Plus Jakarta Sans is the UI face. Both are self-hosted;
  the app still touches no font CDN.
- **New navigation shape.** A 248px labelled sidebar with count badges on a
  counter screen, an 88px icon rail on a tablet, a bottom tab bar on a phone —
  all pinned by construction, so nothing scrolls off the bottom on iOS. Settings
  moved into the nav; the app header is now a per-screen title and subtitle.
- **Screens rebuilt to the spec** — Sell gains a quick-action strip and a cobalt
  cart summary bar; Stock is a proper table with margin and a proportional
  on-hand bar; Reports leads with four KPI cards and a hero takings card;
  Customers is a card grid over three KPIs; the customer ledger's balance card is
  solid cobalt; Settings is two columns with real theme swatches and a PIN
  display; the receipt slip is white paper in both themes.

### Added

- **One-tap install, and a guide for every device.** A cobalt bar appears when
  Dukaan is running in a browser tab and offers the install directly where the
  browser supports it. `/install` explains the actual gesture per platform —
  iOS Safari, iOS Chrome/Firefox (which cannot install, and says so), Android,
  desktop Chromium, desktop Safari — and shows whether the browser has granted
  persistent storage. Dismissal is a snooze until the next day, not a mute.
- **Automatic daily backup to a folder** where the browser can do it (desktop
  Chromium). Choose a folder once — one your Google Drive, iCloud Drive or
  OneDrive client already syncs — and the daily copy lands there with no tap.
  Everywhere else Settings says plainly that no browser on a phone or tablet can
  do this, and the daily one-tap reminder stands. Full analysis in
  [`docs/auto-backup.md`](docs/auto-backup.md).
- Low-stock and outstanding-balance counts as badges on the navigation.
- Average basket as a fourth KPI on Reports.

### Fixed

- `.money` lost its intended font because a legacy stylesheet in a higher
  cascade layer redefined it. The numeric styles are now declared once, and
  unlayered, so nothing can outrank them.
- The persistence warning and the install prompt no longer both appear at once.
- The "Quick sell" tile no longer duplicates the quick-action button of the same
  name.

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
