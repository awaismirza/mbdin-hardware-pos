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
| PWA update UX | Updates only apply on a cold start today, silently | Not started |
| Domain-model / data-layer pass | User flagged it; scope undefined | Not started |
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
