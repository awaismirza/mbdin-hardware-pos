# Dukaan POS — for agents

Offline-first React + TypeScript + SQLite-WASM point of sale for one shop.
**This file is canonical** for process: the definition of done, the
non-negotiable rules, and what must be updated alongside a change. Where it and
`CLAUDE.md` disagree, this file wins.

## Read first

1. **[`STATUS.md`](STATUS.md)** — what is done, in flight, blocked, and next.
2. **[`docs/product-spec.md`](docs/product-spec.md)** — what the app is and its
   hard rules.
3. **[`CLAUDE.md`](CLAUDE.md)** — engineering non-negotiables (paisa, repos,
   one-transaction sale, offline, `opfs-sahpool`, cascade layers, base path).
4. **[`docs/design-spec.md`](docs/design-spec.md)** — canonical for how the app
   looks: colour, type, shape, every component.
5. **[`README.md`](README.md)** — product narrative and the manual pre-release
   checklist.

## Documentation map

| File | What it is | When to touch it |
|---|---|---|
| `STATUS.md` | Cross-session handoff — current state | End of any session that changed what ships or is in flight |
| `docs/product-spec.md` | Canonical, versioned spec (stable path) | A capability or rule changes; snapshot at release |
| `docs/specs/product-spec-vX.Y.Z.md` | Immutable per-version snapshots | Never edited by hand — `npm run release` writes them |
| `docs/spec-changelog.md` | One line per spec change | Only when the spec itself moves |
| `CHANGELOG.md` | What shipped, per version (Keep a Changelog) | Every user-facing change; cut at release |
| `docs/roadmap.md` | Forward-looking, status per item | When priorities or "done" change |
| `docs/design-spec.md` | Canonical visual spec — colour, type, shape, components | A visual rule changes; it is the bug report when code disagrees |
| `docs/auto-backup.md` | What a PWA can and cannot automate for backups, and why | A browser ships the File System Access API, or the backup story changes |
| `docs/RELEASING.md` | The release runbook | Follow it when asked to "make a release" |
| `README.md` / `AGENTS.md` / `CLAUDE.md` | Product / process / engineering | When behaviour, architecture, commands, or rules change |

## Orientation

- `src/App.tsx` — boot, the first-launch gate, the app shell, routes.
- `src/components/app/` — `AppShell` (nav + header + the iOS-safe scroll frame),
  `Screen` (per-screen scaffold enforcing the scroll pattern), theme + direction
  providers.
- `src/components/ui/` — vendored shadcn primitives. `src/components/Dialog.tsx`
  wraps shadcn Dialog/Sheet behind the app's imperative `onClose` API.
- `src/features/sell/` — catalogue, add-to-cart **sheet**, cart pane/drawer,
  checkout, receipt, held carts, scanner, quick-sell.
- `src/features/stock/` — products, photos, movements, CSV import, summaries.
- `src/features/people/` — customer directory (route stays `/people`, copy says
  "Customers"), photos, ledger, payments.
- `src/features/settings/` — onboarding, shop settings, appearance, backup/
  restore, PIN, storage diagnostics, the **About** card (version + build date).
- `src/features/install/` — platform detection (`platform.ts`, unit-tested),
  the `/install` guide screen, and the in-tab install prompt.
- `src/backup/autoExport.ts` — the daily write into a chosen folder, on the
  browsers that can do it. Read `docs/auto-backup.md` before touching it.
- `src/db/repos/` — the only application-level SQL boundary. `src/db/worker.ts`
  owns the SQLite connection. `src/db/jsonRestore.ts` is the dependency-free JSON
  backup wire format shared by the worker, the exporter and tests.
- `src/version.ts` — reads `package.json` version; `vite.config.ts` stamps the
  build time.
- `src/i18n/en.ts` — translation key source of truth; `ur.ts` is type-checked
  against it.
- `src/styles/app.css` — Tailwind entry, the full palette, and the type stack.
  Layer order `theme, base, components, legacy, utilities` so legacy stylesheets
  can never outrank a utility. `.num`/`.money` are declared **unlayered** at the
  bottom so they beat the legacy sheets — see CLAUDE.md for why that matters.
- `tests/e2e/setup.ts` — completes the real first-launch setup for browser
  scenarios.

## Working rules

- All business data access lives in `src/db/repos/`; UI components issue no SQL.
- Schema changes are new numbered migrations. Never edit a shipped migration.
  Add every new persistent table to `BACKUP_TABLES` (`src/db/jsonRestore.ts`) so
  it rides in both `.sqlite3` and `.json` backups — and BLOB columns must
  round-trip (there is a test for photos; extend it).
- Restore **replaces** the ledger, never merges. A pre-restore safety copy is
  written first; if it cannot be and the ledger has data, the restore is refused.
- Visible copy goes in `en.ts` **and** `ur.ts` together; check LTR and RTL.
  English is the default for a new shop; Urdu is an intentional RTL path.
- Money is integer paisa. A sale is one transaction. A balance is
  `SUM(ledger_entries.amount_paisa)`.
- Numbers/dates carry `.num` or `.money`: mono, tabular, and isolated LTR, or
  the bidi algorithm mangles them in Urdu. Mixed text keeps the sans face and
  wraps only the numeric run.
- Follow `docs/design-spec.md` for anything visual. One cobalt primary action
  per view; red only for owed, out, or destructive. Nothing tappable below 34px,
  and the controls a sale passes through clear 44px.
- First launch is incomplete until `shop_name` is saved; never re-show setup for
  a named shop. A reset returns to first launch.
- New screens use the `Screen` component; scroll containers are always a plain
  block with `overflow-y-auto min-h-0`, one flex level below `main` — never a
  grid or flex element directly, or iOS Safari will not scroll it.

## Verification (before any handoff)

```
npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

- E2E runs one device (`tablet-landscape`); it starts from the English
  first-launch setup so failures read cleanly. Keep at least one explicit
  Urdu/RTL path (`a-day-in-the-shop.spec.ts`) and the portrait-viewport scroll
  case in `m7-polish.spec.ts`.
- `test:e2e` needs a built app; set `PLAYWRIGHT_CHROMIUM_PATH` if the environment
  ships its own Chromium.
- Storage tests treat OPFS and IndexedDB as separate ledgers — a first visit to
  either may require setup.
- Prefer `data-testid` for durable assertions when a redesigned element has no
  stable accessible name.

## Making a release

When the user says "make a release": follow **[`docs/RELEASING.md`](docs/RELEASING.md)**.
Short version — `npm run release -- <version>`, flesh out `CHANGELOG.md`, update
`STATUS.md` / `docs/roadmap.md`, run the full verification, commit + tag
`v<version>` + push, `gh release create`. Merging to `main` is what deploys
(GitHub Pages); a release is a version-bump commit plus a tag.

## Deploy & updates

`main` → GitHub Pages automatically (`.github/workflows/deploy.yml`). The service
worker (`src/sw.ts`) deliberately does **not** `skipWaiting()` on an update and
shows no prompt — a new version installs in the background and takes effect only
on the next **cold start** (on an installed iOS PWA, often after a force-quit,
and sometimes on the second launch). Data (OPFS / IndexedDB) is never touched by
a deploy.
