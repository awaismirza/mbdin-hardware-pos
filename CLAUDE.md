# Dukaan POS

Offline-first PWA point of sale for a single shop in Pakistan. No backend, no auth,
no analytics. SQLite WASM on OPFS inside a Web Worker is the source of truth.

> **[AGENTS.md](AGENTS.md) is canonical for process** — read it first (it points
> to `STATUS.md`, the spec, the docs map, and the release runbook). This file is
> the engineering non-negotiables and the storage/base-path context worth not
> rediscovering from code. Where the two disagree, AGENTS.md wins.

## Non-negotiables

- Money is stored as integer paisa. Never a float. Format only at render, via `formatPKR`.
- Every mutation goes through a repository in `src/db/repos`. No SQL in components.
- Completing a sale is a single transaction. All or nothing.
- Nothing may require the network. `wa.me` links opened by the user are the only exception.
- Feature-first folders. Shared UI in `src/components` only when used by 2+ features.
- Design tokens live in `src/styles/app.css` and follow
  [docs/design-spec.md](docs/design-spec.md). No hard-coded colours. Cobalt
  (`--brand`) is the only accent and carries one primary action per view; red
  (`--bad`) means *owed*, *out*, or *erase*, and is never branding.
- Logical CSS properties only, so RTL works without a second stylesheet.
- A customer's balance is always `SUM(ledger_entries.amount_paisa)`. Never denormalise it.
- Never silently open a different database. See "Storage" below.
- Every numeral carries `.num` (or `.money`): it sets IBM Plex Mono with
  tabular figures *and* isolates the run as LTR. Without the isolation the bidi
  algorithm reorders signs, symbols and date separators in Urdu — "+487.20"
  comes out as "487.20+". Mixed text keeps the sans face and wraps only the
  number: `Warn below <span className="num">5</span>`.
- Reports and Settings sit behind the optional PIN. Sell, Stock and People never
  do: the till must never lock mid-queue.

## Storage

The primary path is the **`opfs-sahpool`** VFS (`installOpfsSAHPoolVfs`), not the
classic `opfs` VFS (`sqlite3.oo1.OpfsDb`). The classic one proxies through
`Atomics.wait` on a `SharedArrayBuffer` and therefore requires COOP/COEP headers,
which a plain static host does not send. `opfs-sahpool` needs no headers.

Its handles are exclusive per file, so a reload can briefly find the pool locked
by the outgoing page. `src/db/worker.ts` retries while it is busy and then throws
`OpfsBusyError` rather than falling back — falling back there would hand the user
the empty IndexedDB database and look exactly like a lost ledger.
`src/db/client.ts` terminates the worker on `pagehide` so the handles are released
before the next boot.

The IndexedDB fallback is for browsers with no OPFS at all. It runs the same WASM
build on an in-memory database and rewrites the serialised image after every
write transaction.

## CSS cascade layers

`src/styles/app.css` declares the order once:

    @layer theme, base, components, legacy, utilities;

The pre-redesign stylesheets are imported into `legacy`, which sits *above*
Tailwind's `base` and `components` but below `utilities`. That is deliberate:
their global resets (`* { padding: 0 }`, `button { border: 0 }`) then lose to
every Tailwind utility, while their own component classes still style anything
not yet migrated.

The trap this creates, and it has bitten twice: a rule written in `@layer base`
in app.css **loses** to a copy of the same selector in a legacy stylesheet. That
is how `.money` silently kept the sans face after the redesign set it to mono.
Anything that must beat the legacy sheets — `.num`, `.money` — is declared
unlayered at the bottom of app.css, and must exist in exactly one place.

## Layout and the frame

`AppShell` is one `h-dvh` flex box with `overflow-hidden`. Every piece of chrome
(sidebar, rail, tab bar, cart bar) is a flex child of that box, not
`position: sticky`. The routed screen owns the *only* scroll container, a plain
block with `overflow-y-auto min-h-0`, at most one flex level below `main`.

Do not reach for `sticky` here. Sticky chrome slid off the bottom of the screen
on iOS Safari every time it was tried; pinning by construction is what fixed it,
and `tests/e2e/m7-polish.spec.ts` locks that behaviour down.

Breakpoints follow the design spec: labelled sidebar from `lg` (1024px), an 88px
icon rail at `md` (768px), a bottom tab bar below that.

## Base path

The app must work at the domain root *and* under a GitHub Pages project subpath,
so nothing may hard-code a root-absolute URL. Routes go through the router
(which carries `basename={import.meta.env.BASE_URL}`), full-page navigations
build their URL from `import.meta.env.BASE_URL`, and every path in
`public/manifest.webmanifest` stays relative — that file is copied verbatim and
the bundler never touches it.

## Commands

    npm run dev / build / preview / test / test:e2e / typecheck / lint
    npm run fonts    # refresh public/fonts from the Fontsource packages
    npm run icons    # regenerate PWA icons from the design tokens

`npm run build:pages` produces a GitHub Pages build; set `VITE_BASE=/<repo>/`
with it. `npm run test:e2e` needs a built app; set `PLAYWRIGHT_CHROMIUM_PATH` if the
environment ships its own Chromium instead of Playwright's.
