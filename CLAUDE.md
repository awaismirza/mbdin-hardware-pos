# Dukaan POS

Offline-first PWA point of sale for a single shop in Pakistan. No backend, no auth,
no analytics. SQLite WASM on OPFS inside a Web Worker is the source of truth.

## Non-negotiables

- Money is stored as integer paisa. Never a float. Format only at render, via `formatPKR`.
- Every mutation goes through a repository in `src/db/repos`. No SQL in components.
- Completing a sale is a single transaction. All or nothing.
- Nothing may require the network. `wa.me` links opened by the user are the only exception.
- Feature-first folders. Shared UI in `src/components` only when used by 2+ features.
- Design tokens in `src/styles/tokens.css`. No hard-coded colours or font sizes.
- Logical CSS properties only, so RTL works without a second stylesheet.
- A customer's balance is always `SUM(ledger_entries.amount_paisa)`. Never denormalise it.
- Never silently open a different database. See "Storage" below.
- Numbers and dates carry `.num` (or `.money`), which isolates them as LTR runs.
  Without it the bidi algorithm reorders signs, symbols and date separators in
  Urdu — "+487.20" comes out as "487.20+".
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

## Commands

    npm run dev / build / preview / test / test:e2e / typecheck / lint
    npm run fonts    # refresh public/fonts from the Fontsource packages
    npm run icons    # regenerate PWA icons from the design tokens

`npm run test:e2e` needs a built app; set `PLAYWRIGHT_CHROMIUM_PATH` if the
environment ships its own Chromium instead of Playwright's.
