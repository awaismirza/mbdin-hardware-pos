# Status

Cross-session handoff log. **Read this first.** Any agent — or a human — picking
up the repo should be able to tell from this file what is done, what is in
flight, what is blocked, and what to do next, without re-reading the whole git
history.

Keep it honest: an item is `Done` only when it is on `main` and verified; if
something is half-built, say so and say what is left.

---

**Last release:** `1.0.0` — 2026-09-04 (tag `v1.0.0`)
**Branch:** `feature/redesign-cobalt` — pushed, **awaiting the user's manual
testing**. Do not cut a release from it until they say so.
**Deploy:** GitHub Pages, automatic on merge to `main` →
<https://awaismirza.github.io/mbdin-hardware-pos/>
**Health:** `npm test` · `npm run typecheck` · `npm run lint` ·
`npm run build` · `npm run test:e2e` — all green on the branch

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

- **Cobalt redesign** (`feature/redesign-cobalt`) — the whole view layer rebuilt
  against `docs/design-spec.md`: new palette and type stack, sidebar/rail/tab-bar
  navigation, every screen re-laid-out. No behaviour or data changes.
- **Install experience** — an in-tab prompt plus a per-platform `/install` guide
  (`src/features/install/`), with the platform detection unit-tested.
- **Automatic daily backup** to a chosen folder where the browser allows it
  (`src/backup/autoExport.ts`), with the full capability analysis written up in
  `docs/auto-backup.md`.

## In progress

- The cobalt redesign is code-complete and green, but **not merged**: it is
  waiting on the user's manual testing on their own devices. The next action on
  it is theirs, not an agent's.

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
