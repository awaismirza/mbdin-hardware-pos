# Dukaan POS

This is an offline-first React, TypeScript and SQLite WASM point-of-sale app for one shop. Read [README.md](README.md) for product behaviour and [CLAUDE.md](CLAUDE.md) for the engineering constraints before making a substantial change.

## Orientation

- `src/App.tsx` owns boot, the first-launch gate, app shell, and routes.
- `src/features/sell/` is the catalogue, product quantity/price flow, cart, checkout, receipts, and held carts.
- `src/features/stock/` owns products, photos, stock movements, CSV import, and stock summaries.
- `src/features/people/` is the customer directory, customer photos, balance ledger, and payments. The route remains `/people`; all visible copy calls it Customers.
- `src/features/settings/` owns onboarding, shop settings, backup/restore, PIN, and storage diagnostics.
- `src/db/repos/` is the only application-level SQL boundary. `src/db/worker.ts` owns the SQLite WASM connection.
- `src/i18n/en.ts` is the translation key source of truth; `ur.ts` is checked against it.
- `tests/e2e/setup.ts` completes the real first-launch setup for browser scenarios.

## Current product behaviour

- Fresh installs default to English and show `SetupScreen` until a non-empty `shop_name` is saved. Language, phone, and address can be chosen there; only the name is required.
- Product tiles show their image and open a dedicated quantity/line-total page before adding to cart. Fractional units use fractional quantities.
- Stock is image-led, with summary cards and a product detail hero. Customer records can store a local photo.
- Phone/tablet uses a sticky bottom navigation and cart bar; desktop/tablet-landscape uses a persistent left rail and sticky cart pane.
- Customer images live in `customer_images`; they are included in SQLite and JSON backup flows. Migration `004_customer_images` created that table.

## Working rules

- Keep all business data access in `src/db/repos/`; UI components must not issue SQL.
- Add schema changes as a new numbered migration. Never edit an existing migration.
- Treat the local ledger and backups as shopkeeper data: preserve compatibility and include new data tables in backup export/import paths.
- Use the translation bundles for all visible copy. English is the default language for a new shop; Urdu remains an intentional RTL-supported language.
- First launch is incomplete until `shop_name` is saved. Do not re-show setup for an existing shop with a name.
- Resetting a ledger returns it to first launch. Complete setup before using settings to restore a backup; the restored backup replaces those temporary details.

## Change checklist

1. Add visible copy to English and Urdu together, then check LTR and RTL layouts.
2. Add new persistent tables through a numbered migration and include them in export/import.
3. Preserve units, paisa arithmetic, movement history, and transactional sale behaviour when changing selling or stock.
4. Use test IDs for durable E2E assertions when a redesigned UI does not have a stable accessible name.
5. Update this file and README when behaviour, setup, architecture, or release checks change.

## Verification

- Routine unit and E2E scenarios start from the English first-launch setup so failure reports are readable.
- Keep at least one explicit Urdu/RTL E2E acceptance path; it is not a default-language test.
- Before handoff run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and the relevant Playwright suite (or all of `npm run test:e2e` for cross-flow changes).
- The focused first-launch suite is `npm run test:e2e -- tests/e2e/m0-setup.spec.ts`.
- Storage tests must account for OPFS and IndexedDB being separate ledgers; a first visit to either may require setup.
