# Roadmap

Forward-looking. Not a promise of order or timing — a place to record what has
been considered so a future session does not re-derive it. `Done` items move to
`CHANGELOG.md` at release time and stay here only long enough to show they
landed.

| Item | Why | Status |
|---|---|---|
| M1–M7 core app | The product | Done — 1.0.0 |
| GitHub Pages deploy under a subpath | Free static hosting | Done — 1.0.0 |
| View-layer redesign (Tailwind + shadcn, dark mode) | Modern, consistent UI | Done — 1.0.0 |
| Backup/restore robustness + photo coverage | Reported data loss on JSON restore; `.sqlite3` unpickable on iOS | Done — 1.0.0 |
| Version in Settings + release process | Know what is deployed; repeatable releases | Done — 1.0.0 |
| Cobalt redesign to `docs/design-spec.md` | A modern POS surface, not a bahi-khata | Done — on `feature/redesign-cobalt`, awaiting manual testing |
| One-tap install + per-platform install guide | Shopkeepers left it in a browser tab, where the ledger can be evicted | Done — same branch |
| Automatic daily backup to a folder | "Can it export by itself at the end of the day?" | Done where the browser allows it (desktop Chromium); see `docs/auto-backup.md` |
| Day session (open/close the till, cash in drawer) | In the design spec; no data model for it yet | Not started — spec'd, deliberately unbuilt |
| Purchase orders / supplier invoices | In the design spec; needs a suppliers table | Not started — spec'd, deliberately unbuilt |
| Returns and refunds flow | In the design spec; voiding a whole sale is the only reversal today | Not started — spec'd, deliberately unbuilt |
| PWA update UX | Updates only apply on a cold start today, silently | Not started |
| Domain-model / data-layer pass | User flagged it; scope undefined. The three spec'd-but-unbuilt rows above are the obvious first candidates | Not started |
| Screen Wake Lock on Sell | Screen sleeps at a busy counter | Not started |
| App-icon badge for debtors | Glanceable "someone owes money" | Not started |
| Web Share Target for photos | Add a product/customer photo from the share sheet | Not started |
| `BarcodeDetector` with ZXing fallback | Drop ~250 KB where the platform has native scanning | Not started |
| Lazy-loaded routes | Trim the initial JS chunk | Not started |
| Supplier records / purchase invoices | Track cost of goods properly | Idea only |
| Multi-device sync | Explicitly out of scope for v1 — needs conflict resolution nobody has specified | Not planned |

## Non-goals

- A backend, accounts, or analytics.
- Merging two divergent ledgers on restore. Restore replaces; it does not merge.
- A second stylesheet for RTL — logical properties only.
