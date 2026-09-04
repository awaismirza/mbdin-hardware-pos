# Releasing Dukaan POS

The version the shopkeeper sees lives in **Settings → About**. It is read from
`package.json`'s `version` field (via `src/version.ts`) — that field is the one
source of truth. A "release" is: bump that number, write down what changed, tag
it, and let the deploy run.

There is no separate build or publish step: **merging to `main` deploys to
GitHub Pages** (`.github/workflows/deploy.yml`). A release is therefore a small
commit on top of `main`, plus a git tag and a GitHub Release for the record.

---

## When the user says "make a release"

Do this, in order. It is short and every step is mechanical.

### 1. Decide the version

Semver against the **previous** tag:

| Change since last release | Bump |
|---|---|
| Bug fixes, copy, styling, docs only | patch — `1.0.0` → `1.0.1` |
| New feature, new screen, additive data | minor — `1.0.0` → `1.1.0` |
| A change that breaks a saved ledger, a backup file, or a stored setting; a removed feature | major — `1.0.0` → `2.0.0` |

If the user named a version, use theirs.

### 2. Run the helper

```
npm run release -- <version>       # e.g. npm run release -- 1.1.0
```

`scripts/bump-version.mjs` does the boring, drift-prone parts:

- sets `package.json` `version`
- in `CHANGELOG.md`, renames the `## [Unreleased]` heading to
  `## [<version>] — <today>` and inserts a fresh empty `## [Unreleased]`, and
  adds the two link-reference lines at the bottom
- snapshots `docs/product-spec.md` to `docs/specs/product-spec-v<version>.md` and
  rewrites the `**Version:**` header in the stable file
- prints the remaining manual steps

It does **not** commit, tag, or push — you review first.

### 3. Fill in the changelog

Open `CHANGELOG.md`. The new `## [<version>]` section holds whatever was under
`[Unreleased]`. Make sure every user-facing change since the last tag is there,
in plain shopkeeper language, under `Added` / `Changed` / `Fixed` / `Removed`.
Look at `git log <previous-tag>..HEAD` for anything missed.

### 4. Update the other docs

- **`STATUS.md`** — set the "Last release" line, move anything that shipped out of
  "In progress", and refresh "Next up".
- **`docs/roadmap.md`** — mark shipped items `Done`.
- **`AGENTS.md` / `README.md`** — only if behaviour, architecture, commands, or
  the verification list actually changed this cycle.
- **`docs/product-spec.md`** — if the spec itself changed (new capability, new
  rule), also add a one-line entry to `docs/spec-changelog.md`. A styling or
  bug-fix release usually leaves the spec untouched — the snapshot from step 2
  is still taken so the numbered file exists for every version.

### 5. Verify

```
npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

All green, no exceptions. `test:e2e` needs the built app; set
`PLAYWRIGHT_CHROMIUM_PATH` if the environment ships its own Chromium.

### 6. Commit, tag, push

```
git add -A
git commit -m "Release <version>"
git tag -a v<version> -m "Dukaan POS <version>"
git push origin main --follow-tags
```

If `main` is protected, push the commit on a branch, open a PR titled
`Release <version>`, merge it, then tag the merge commit on `main` and push the
tag.

### 7. GitHub Release

```
gh release create v<version> --title "Dukaan POS <version>" --notes-from-tag
```

or paste the `CHANGELOG.md` section as `--notes`.

### 8. Confirm the deploy

```
gh run list --workflow=deploy.yml --limit 1
```

Wait for `completed / success`. Then open the site and check **Settings → About**
shows the new version. Installed PWAs pick it up on the next cold start — see the
service-worker note in `AGENTS.md`.

---

## What a release is *not*

- Not a code freeze — work continues on `main` straight after.
- Not a chance to sneak in changes — the release commit only bumps the version
  and edits docs. Anything else goes in its own PR first.
- Not tied to a cadence — cut one whenever there is something worth a version.
