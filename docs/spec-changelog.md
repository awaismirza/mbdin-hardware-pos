# Spec changelog

One entry per change to [`docs/product-spec.md`](product-spec.md) — a new
capability, a changed rule, a scope decision. Bug fixes and styling that do not
change what the spec says do **not** get an entry here (they go in
`CHANGELOG.md`). The spec is snapshotted to `docs/specs/product-spec-v<version>.md`
at every release regardless.

## v1.0.0 — 2026-09-04

- Spec established. Baseline captures the app as shipped at the first tagged
  release: sell / stock / customers / reports / settings, `opfs-sahpool` storage
  with an IndexedDB fallback, `.sqlite3` / `.json` / CSV backup with photos
  carried in both database formats, restore-replaces-never-merges, first-run
  setup, optional PIN over Reports and Settings, offline PWA, Tailwind + shadcn
  view layer with light/dark and first-class RTL.
