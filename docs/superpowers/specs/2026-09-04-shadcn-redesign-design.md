# Dukaan POS — view-layer redesign (shadcn + Tailwind)

**Date:** 2026-09-04
**Branch:** `redesign` (single long-lived branch, big-bang cutover)
**Status:** approved to build

## 1. Goal

Replace the entire view layer with a modern, clean-SaaS design system built on
Tailwind v4 + shadcn/ui, light **and** dark, Urdu/RTL first-class, with the
interaction flows (nav, cart, checkout, product entry) reworked against
best-in-class POS UX. Fix the iOS Safari scroll failure at the layout
foundation.

## 2. Hard boundaries — what does NOT change

Preserved verbatim; the rewrite imports these and must not alter their
behaviour:

- `src/db/**` — SQLite/OPFS worker, `repos/*`, migrations, `client.ts`,
  `worker.ts`, `testDb.ts`. Money stays integer paisa. A sale stays one
  transaction. Balance stays `SUM(ledger_entries.amount_paisa)`.
- `src/backup/**` — export/import, `BACKUP_TABLES`.
- `src/lib/**` — `money.ts` (`formatPKR`, `parsePaisa`, `roundQty`, `lineTotal`),
  `dates.ts`, `csv.ts`, `photo.ts`, `protection.ts`.
- `src/i18n/**` — `en.ts` is the key source of truth; `ur.ts` mirrors it. New
  keys are added to both. `pickName`, `translator`, `LANGUAGES`.
- `src/sw.ts`, `src/pwa.ts` — service worker + registration. Offline guarantee
  intact. Only `wa.me` may touch the network.
- `public/manifest.webmanifest` — copied verbatim, all paths relative.
- Vite base-path handling: router `basename={import.meta.env.BASE_URL}`, hard
  navigations off `import.meta.env.BASE_URL`.
- Unit tests under `src/**/*.test.ts(x)` keep passing unchanged.

The domain-model / data-layer work discussed separately is **out of scope
here** and will branch off `main` after this lands.

## 3. Stack

| Concern | Choice |
|---|---|
| Bundler | Vite 5 (kept) |
| CSS | Tailwind v4 via `@tailwindcss/vite`, CSS-first `@theme` |
| Components | shadcn/ui (copied into `src/components/ui/`), Radix primitives |
| Variants | `class-variance-authority`, `clsx`, `tailwind-merge` (`cn()` helper) |
| Animation | `tw-animate-css` (v4-compatible) |
| Icons | `lucide-react` |
| Router | `react-router-dom` v6 (kept) |
| State | `zustand` (kept) — `appStore`, `cartStore` reworked for new UI only |
| Fonts | self-hosted via Fontsource (offline): Latin + Arabic. Kept. |
| Theme | `class` strategy on `<html>`; `system` default + explicit override in `localStorage` |

shadcn is **not** a runtime dependency — components are vendored and edited in
place. Routes are lazy-loaded (`React.lazy`) so shadcn/Radix weight is
code-split per area.

## 4. Layout foundation (fixes the iOS scroll bug)

Root causes of the current failure:

1. The scroll container was 5 nested flex levels deep
   (`shell__main > sell > sell__panes > sell__catalogue > catalogue > catalogue__grid`).
2. The scroll container was itself `display: grid` — iOS Safari does not
   reliably give a grid element a scrollport when its height comes from
   `flex: 1; min-height: 0`.
3. `.sell__catalogue` was `display: block`, so its child's `flex: 1` resolved
   to nothing (fixed in PR #6, but the nesting problem remained).

Foundation rules, enforced for every screen:

- **App frame:** `<div>` with `height: 100dvh; display: flex; flex-direction: column; overflow: hidden`.
  Children: `<header>` (`shrink-0`), `<main class="flex-1 min-h-0">`, `<nav>` (`shrink-0`).
  Header/nav carry `env(safe-area-inset-*)` padding.
- **Route wrapper:** each route renders a `flex min-h-0 flex-1 flex-col`
  container. At most **one** intermediate flex level before the scroll area.
- **Scroll container:** always a plain block element —
  `class="min-h-0 flex-1 overflow-y-auto overscroll-contain"`. Grids and lists
  live *inside* it at natural height. Never put `overflow-y:auto` on a
  `grid`/`flex` element directly.
- No `position: sticky` load-bearing for the nav — the nav is a flex row of the
  frame, always on screen by construction.
- Landscape/tablet: the left rail is `grid-template-columns: rail 1fr` on the
  frame; `main` still owns its single scroll container.

A Playwright case per area asserts: seeded content, the inner container
scrolls, `document.scrollingElement.scrollTop === 0`, nav within viewport —
run at a **portrait** viewport (`test.use({ viewport })`), since the default
project is landscape.

## 5. Design tokens (light + dark)

shadcn CSS-variable convention in `src/styles/theme.css`, consumed by
`@theme inline` so Tailwind utilities map to them:

- Base: `--background --foreground --card --card-foreground --popover
  --popover-foreground --muted --muted-foreground --border --input --ring`
- Semantic accents (carried over from the ledger identity, retuned for SaaS):
  - `--primary` — actions. `--destructive` — void/delete.
  - `--success` — paid / in stock. `--warning` — low stock / backup overdue.
  - `--money` — the one colour for totals where cash changes hands.
- Radius scale (`--radius` 0.625rem base, `sm/md/lg/xl` derived).
- Light is the default `:root`; `.dark` overrides. Both hand-tuned, WCAG AA for
  text pairs. `prefers-color-scheme` respected when the user has not chosen.
- Numbers/dates keep the `.num` / `.money` LTR-isolate rule (bidi safety in
  Urdu) — ported as a Tailwind component class.

## 6. RTL

- `<html dir>` continues to be set from language (`applyDocumentLanguage`).
- App wrapped in Radix `<DirectionProvider dir={dir}>`.
- Tailwind: logical utilities only in app code (`ps-/pe-/ms-/me-/start-/end-/
  text-start/text-end/border-s/border-e`), plus `rtl:`/`ltr:` variants where a
  physical rule is unavoidable.
- Directional icons (`ChevronLeft`, back arrows, progress) get `rtl:-scale-x-100`.
- The Urdu font stack applies via `html[lang='ur']`.
- Acceptance: keep one full Urdu/RTL E2E path (the "day in the shop" spec).

## 7. Component inventory (shadcn primitives to vendor)

`button input textarea label card badge dialog sheet drawer dropdown-menu
select tabs tooltip switch separator scroll-area sonner (toast) skeleton
alert avatar` — plus app-specific composed components:

- `AppShell`, `SideNav` / `TabBar`, `PageHeader`
- `MoneyText`, `QtyText` (bidi-isolated), `PriceInput`, `QuantityStepper`
- `ProductTile`, `ProductPhoto`, `CustomerAvatar` (ported)
- `NumberPad` (checkout / quick-sell), `EmptyState`, `ConfirmDialog`

## 8. Area plan (each = its own design pass + PR-sized commit on this branch)

0. **Foundation** — deps, Tailwind/shadcn config, `theme.css`, `cn()`, fonts,
   `AppShell` + nav + header + routing + theme toggle + `DirectionProvider`,
   base primitives, the scroll-container pattern, the per-area scroll test
   helper. Boot / Setup screen restyled. **Build + typecheck + unit green;
   existing E2E updated only where selectors moved.**
1. **Sell** — catalogue with one-tap add + inline qty; cart as a right pane
   (landscape) / bottom drawer (portrait) with live editing; streamlined
   checkout (NumberPad, method, customer) in one sheet; receipt; held carts;
   scanner; quick-sell. Biggest flow change.
2. **Stock** — product list (cards + summary), detail, editor, CSV import,
   movement history.
3. **Customers** — list, detail (balance hero + ledger), payment / adjust
   sheets, photo capture.
4. **Reports** — today / month / range figures, top sellers, debtors, CSV
   export. Behind PIN.
5. **Settings + onboarding** — shop details, backup/restore, PIN, storage
   diagnostics, theme + language. Setup (first-run) flow. Behind PIN (except
   first-run).

## 9. Testing / done criteria

- `npm test` — all current unit tests pass untouched.
- `npm run typecheck`, `npm run lint`, `npm run build` — clean.
- `npm run test:e2e` — all scenarios pass; selectors updated; behaviour
  assertions (paisa totals, one-transaction sale, ledger reconciliation,
  backup round-trip, PIN, offline cold boot, RTL day) unchanged.
- New portrait scroll test per area.
- Manual check on real iOS Safari (iPhone + iPad) before the branch merges:
  every screen scrolls, nav stays put, safe areas respected, dark mode legible.
- Lighthouse PWA + installability still pass.

## 10. Risks

- **shadcn/Tailwind v4 + React 18** — if the shadcn CLI insists on React 19,
  vendor components manually from the v4 registry; no framework upgrade in this
  branch.
- **RTL regressions** — every screen reviewed in both directions; icons audited.
- **Bundle growth** — lazy routes + `lucide-react` per-icon imports; watch the
  build output, keep `react`/`zxing`/sqlite chunks split as today.
- **E2E churn** — expected and acceptable; the behavioural assertions are the
  contract, not the selectors.
- **Long branch drift** — only `main` fix in flight is the domain-layer work,
  which starts after this; rebase as needed.
