# Status

Cross-session handoff log. **Read this first.** Any agent — or a human — picking
up the repo should be able to tell from this file what is done, what is in
flight, what is blocked, and what to do next, without re-reading the whole git
history.

Keep it honest: an item is `Done` only when it is on `main` and verified; if
something is half-built, say so and say what is left.

---

**Last release:** `1.0.0` — 2026-09-04 (tag `v1.0.0`). The cobalt redesign, the
install experience, multi-cart and the profit toggle are on `main` and deployed
but **not yet tagged** — cut `1.1.0` when asked.
**Branch:** `feature/multicart-profit-lock` — pushed, **awaiting the user's
manual testing**. Do not tag until they say so.
**Deploy:** GitHub Pages, automatic on merge to `main` →
<https://awaismirza.github.io/mbdin-hardware-pos/>
**Health:** `npm test` 119 · `npm run test:e2e` 37 · typecheck · lint · build —
all green

---

## Done

- Full app through M1–M7: storage, products, sell flow, customers/udhaar,
  backup/archive/restore, reports, PWA polish, PIN.
- GitHub Pages deploy, working under the project subpath.
- Home-screen install detection reconciled with storage persistence.
- **View-layer redesign** on Tailwind v4 + shadcn/ui — every screen rebuilt,
  light + dark, RTL first-class, iOS-safe scroll layout, add-to-cart as a sheet.
- **Backup/restore robustness** — JSON restore runs entirely in the worker;
  `.sqlite3` file picker no longer greys out on iOS; pre-restore safety copy
  enforced; product and customer photos proven to round-trip in both formats
  (unit + E2E).
- **Version surfaced** in Settings → About; release process written up in
  `docs/RELEASING.md`; `CHANGELOG.md`, `docs/product-spec.md`,
  `docs/roadmap.md` and this file established.
- **Cobalt redesign** (PR #11, merged) — the whole view layer rebuilt against
  `docs/design-spec.md`: new palette and IBM Plex Mono type stack, sidebar / rail
  / tab-bar navigation, every screen re-laid-out. No behaviour or data changes.
  Fixed a real bug on the way — `.money` had lost its font to a legacy stylesheet
  in a higher cascade layer.
- **Install experience** — an in-tab prompt plus a per-platform `/install` guide
  (`src/features/install/`), with the platform detection unit-tested. Says
  plainly that Chrome/Firefox on iOS cannot install.
- **Automatic daily backup** to a chosen folder where the browser allows it —
  desktop Chromium only (`src/backup/autoExport.ts`). No phone/tablet browser
  can, and the UI says so; full capability analysis in `docs/auto-backup.md`.

## In progress

- **`feature/multicart-profit-lock`** — code-complete and green, **not merged**,
  waiting on manual testing. Three things:
  - **Multiple carts** — the Sell screen has cart tabs now; each is an
    independent `kind='active'` row in `held_carts`. `cartStore` holds
    `{ carts, currentId }`; `completeSale` takes a `cartId` and clears just that
    row. The old Hold / held-carts model and its repo functions are gone.
  - **Hide profit** — `settings['hide_profit']`; a `Settings → Privacy` switch
    gated by the PIN; Reports masks the profit KPI as `••••`. CSV untouched.
  - **Settings sideways-scroll fix** — the four `xl:grid-cols-[1.55fr_1fr]`
    wrappers are flex on mobile now; regression test at 320px in `m7-polish`.

## Blocked

_Nothing._

## Next up (no commitment, ordered by rough priority)

1. **PWA update UX** — updates currently apply only on a full cold start with no
   prompt (by design, to never interrupt a sale). Consider a quiet
   "new version — tap to reload" affordance. See the service-worker note in
   `AGENTS.md`.
2. **Domain-model / data-layer work** the user flagged earlier (`src/types/domain.ts`,
   `src/db/repos`, new migrations) — scope not yet defined.
3. **Native-web features** available on this static host: Screen Wake Lock for a
   busy counter, app-icon badge for customers who owe, Web Share Target for
   photos, `BarcodeDetector` to drop the ZXing bundle where supported.
4. Trim the main JS chunk with lazy-loaded routes.
5. **Design-spec gaps left deliberately unbuilt** because the data model has no
   home for them: the day session (open/close the till, cash in the drawer),
   purchase orders, and the returns/refund flow. All three appear in
   `docs/design-spec.md`; none is faked in the UI. See `docs/roadmap.md`.

## House rules for this file

- Update it at the end of any session that changed what is shipped or in flight.
- When cutting a release, bump the "Last release" line (step 4 of
  `docs/RELEASING.md`).
- Do not turn it into a changelog — `CHANGELOG.md` is the record of what shipped;
  this is the record of where things stand *now*.
