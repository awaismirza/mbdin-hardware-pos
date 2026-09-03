/**
 * The on-device archive.
 *
 * A folder in OPFS holding the last 14 database copies, plus the automatic
 * daily one and the safety copy taken before any restore.
 *
 * This is a safety net, not a backup. It lives in the same browser profile as
 * the ledger it protects: clear site data, reinstall the browser, or drop the
 * tablet, and it goes with everything else. The UI says so in plain words. The
 * real backup is the one the shopkeeper sends to himself on WhatsApp.
 */

import { db } from '../db/client';
import { setSetting } from '../db/repos/settingsRepo';
import { fileStamp, isLaterKarachiDay, nowIso } from '../lib/dates';

const ARCHIVE_DIR = 'archives';
const KEEP = 14;

export interface ArchiveEntry {
  name: string;
  size: number;
  /** Parsed out of the filename; OPFS gives no creation time. */
  stamp: string;
}

function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
}

async function archiveDir(create = true): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(ARCHIVE_DIR, { create });
  } catch {
    return null;
  }
}

/** Writes a copy into the archive folder and prunes the oldest beyond KEEP. */
export async function writeArchive(prefix = 'auto'): Promise<string | null> {
  const dir = await archiveDir();
  if (!dir) return null;

  const bytes = await db.exportBytes();
  const name = `${prefix}-${fileStamp()}.sqlite3`;

  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes.slice());
  } finally {
    await writable.close();
  }

  await prune(dir);
  return name;
}

/**
 * The copy taken immediately before a restore. Named so it is obvious what it
 * is at three in the morning when the wrong file has just been restored.
 */
export async function writePreRestoreArchive(): Promise<string | null> {
  return writeArchive('pre-restore');
}

export async function listArchives(): Promise<ArchiveEntry[]> {
  const dir = await archiveDir(false);
  if (!dir) return [];

  const entries: ArchiveEntry[] = [];
  // OPFS directory handles are async iterables; the typings lag the browsers.
  const iterable = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name, handle] of iterable) {
    if (handle.kind !== 'file' || !name.endsWith('.sqlite3')) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    entries.push({ name, size: file.size, stamp: stampOf(name) });
  }
  // Newest first, by the stamp in the name rather than by mtime, which OPFS
  // does not reliably expose.
  return entries.sort((a, b) => b.stamp.localeCompare(a.stamp));
}

export async function readArchive(name: string): Promise<Uint8Array | null> {
  const dir = await archiveDir(false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteArchive(name: string): Promise<void> {
  const dir = await archiveDir(false);
  if (!dir) return;
  await dir.removeEntry(name).catch(() => {});
}

/**
 * Once per Karachi calendar day, on boot, in the background.
 *
 * Deliberately never awaited by the UI: this must not add a second to opening
 * the app at seven in the morning, and a failure here is not worth a message.
 */
export async function runDailyArchive(lastArchiveAt: string): Promise<boolean> {
  const now = nowIso();
  if (!isLaterKarachiDay(now, lastArchiveAt || null)) return false;
  try {
    const written = await writeArchive('auto');
    if (!written) return false;
    await setSetting('last_archive_at', now);
    return true;
  } catch (error) {
    console.warn('[archive] daily copy failed', error);
    return false;
  }
}

/** Keeps the newest KEEP files, and never prunes a pre-restore copy. */
async function prune(dir: FileSystemDirectoryHandle): Promise<void> {
  const entries = await listArchives();
  const auto = entries.filter((entry) => entry.name.startsWith('auto-'));
  for (const entry of auto.slice(KEEP)) {
    await dir.removeEntry(entry.name).catch(() => {});
  }
  // Pre-restore copies are kept longer, but not forever.
  const preRestore = entries.filter((entry) => entry.name.startsWith('pre-restore-'));
  for (const entry of preRestore.slice(KEEP)) {
    await dir.removeEntry(entry.name).catch(() => {});
  }
}

function stampOf(name: string): string {
  const match = /(\d{4}-\d{2}-\d{2}-\d{4})/.exec(name);
  return match?.[1] ?? '';
}
