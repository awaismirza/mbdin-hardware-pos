# Automatic backup: what a PWA can and cannot do

**Question asked:** can Dukaan export the database or a JSON copy automatically at
the end of each day, and put it somewhere durable — iCloud Drive on iOS, Google
Drive on Android?

**Short answer:** on a desktop browser, yes, genuinely automatically. On a phone
or tablet, no — and no web app can, on any browser, today. The honest best is
one tap a day. This document is the evidence for that, so nobody re-litigates it
from scratch.

---

## 1. The three ways a file can leave this app

| Mechanism | Where it works | Needs a tap? | Reaches a cloud folder? |
| --- | --- | --- | --- |
| **File System Access API** (`showDirectoryPicker` + a stored handle) | Desktop Chrome, Edge, Opera | Once, ever | Yes — any local folder, including one a Drive/iCloud/OneDrive desktop client syncs |
| **Web Share API with files** (`navigator.share({ files })`) | Android Chrome, iOS Safari 15+ | Every time | Yes — the share sheet lists Drive, Files, WhatsApp |
| **Anchor download** (`<a download>`) | Everywhere | Every time | Only into the Downloads folder |

Everything else people suggest turns out to be one of these three wearing a hat.

## 2. Why mobile cannot do it without a tap

### iOS / iPadOS

Every browser on iOS is WebKit — Chrome, Firefox and Edge are Safari with
different chrome around them, because App Store rules require it. So "use Chrome
instead" changes nothing about capabilities.

WebKit has **not implemented the File System Access API** and has publicly
positioned it as a fingerprinting and phishing risk they do not intend to ship.
There is no `showDirectoryPicker`, no persisted directory handle, no
`showSaveFilePicker`.

The only route off the device is `navigator.share({ files })`, which:

- requires transient user activation — it must be called from inside a real tap
  handler, and throws otherwise. There is no way to call it on a timer, from a
  service worker, or on `visibilitychange`.
- shows the system share sheet, where the user chooses "Save to Files" ▸ iCloud
  Drive. The app cannot preselect a destination or remember one.

There is no iCloud Drive web API. iCloud is not addressable from a web page at
all.

**Conclusion for iOS: one deliberate tap per backup. That is the floor.**

### Android

Android Chrome does not implement the File System Access API either — it is a
desktop-only API in Chromium. `showDirectoryPicker` is `undefined` there.

Google Drive *does* have a REST API, but using it would mean OAuth, a client
secret, a Google account, and a network round trip — which breaks the app's
first constraint outright ("nothing may require the network", CLAUDE.md). It
would also turn a no-account app into one with an account.

So Android is the same as iOS in practice: `navigator.share({ files })` from a
tap, and the share sheet has Drive in it.

### What about the Background Sync / Periodic Background Sync API?

`periodicsync` exists in Chromium and could fire a service worker once a day.
It does not help:

- it is not implemented in WebKit, so iOS is out regardless;
- a service worker still cannot write to the file system or call
  `navigator.share` — it has no user activation and no window;
- it is gated on the site being installed *and* on an opaque browser
  "engagement" score, so it cannot be relied on even where it exists.

It could, at best, refresh the on-device OPFS archive. Dukaan already does that
on launch, which is when it matters.

## 3. What is actually implemented

Three layers, in increasing order of durability:

**1. The OPFS archive — automatic, every day, everywhere.**
`src/backup/archive.ts` writes a dated copy into an OPFS folder on first launch
of each Karachi day and keeps the last 14. This costs nothing and survives a
mis-restore or an accidental erase inside the app. It is *not* a backup: it
lives in the same browser profile as the ledger, so clearing site data or losing
the tablet takes it too. The UI says so in those words.

**2. Automatic daily export to a folder — desktop only.**
`src/backup/autoExport.ts`. The shopkeeper picks a folder once via
`showDirectoryPicker`; the handle is kept in IndexedDB (it is structured-
cloneable, so IndexedDB is the only place it *can* live — `localStorage` would
stringify it into `[object Object]`). On each first-launch-of-the-day the app
re-checks the permission and writes `dukaan-<shop>-<stamp>.sqlite3` into that
folder. Point it at a folder the Google Drive, iCloud Drive or OneDrive desktop
client already syncs and the copy leaves the machine by itself.

This is the only configuration in which "automatic off-device backup" is
truthful, so it is also the only one where the app calls `markBackedUp()` from
an unattended path.

Permission is re-queried, never assumed: a handle whose permission has lapsed to
`prompt` cannot be re-granted without a user gesture, so the daily run reports
`needs-permission` and leaves the reminder standing rather than silently doing
nothing.

**3. The daily reminder — everywhere else.**
Where no folder API exists, Settings says so plainly rather than offering a
switch that would do nothing (`backup.autoUnavailable`), and the amber bar in
`BackupBar` appears once a real off-device backup is more than 24 hours old. One
tap opens the share sheet, which on both Android and iOS contains Drive, Files
and WhatsApp. Sending it to yourself on WhatsApp is what a shopkeeper will
actually do, and it is a real off-device copy.

## 4. Rejected alternatives, and why

| Idea | Why not |
| --- | --- |
| Google Drive REST API | Needs OAuth, a network, and an account. Breaks the offline-first and no-account constraints. |
| A small sync server of our own | Same three problems, plus we would then hold a shop's books. |
| `periodicsync` writing to Drive | Not on iOS; a service worker cannot share or write files anyway. |
| Emailing the backup automatically | `mailto:` cannot attach a file. |
| Writing into the Downloads folder on a schedule | `<a download>` needs a user gesture in every browser that matters, and Downloads is not synced anywhere. |
| Telling the user it is automatic on mobile anyway | It would be a lie, and the failure mode is a lost ledger. |

## 5. What would change this

- WebKit implementing the File System Access API. Watch
  `showDirectoryPicker` in `window` — `supportsAutoExport()` already gates on
  exactly that, so iOS would light up with no code change.
- Chromium shipping File System Access on Android. Same gate, same outcome.

Until one of those happens, the daily tap is the product.
