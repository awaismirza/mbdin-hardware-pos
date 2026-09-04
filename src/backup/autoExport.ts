/**
 * Automatic daily export to a folder the shopkeeper chooses.
 *
 * The honest scope of this, which took some digging and is worth writing down
 * so nobody re-derives it (the long version is in docs/auto-backup.md):
 *
 *   - The File System Access API (`showDirectoryPicker` and a directory handle
 *     that survives a reload) exists on **desktop Chromium only**. Where it
 *     exists, the shopkeeper picks a folder once — a Google Drive, iCloud Drive
 *     or OneDrive folder if they have the desktop client — and from then on the
 *     daily copy lands there with no tap at all, and the cloud client syncs it.
 *   - Android Chrome does not implement it. iOS Safari does not implement it.
 *     On both, a file can only leave the app through the Share sheet, which is
 *     a user gesture by design: there is no API that writes to iCloud Drive or
 *     Google Drive in the background, and any claim otherwise is wrong.
 *
 * So on a phone or tablet the daily backup is one tap, not zero, and the app
 * says so rather than pretending. `supportsAutoExport()` is what the UI asks.
 */

import { exportSqlite } from './exporters';
import { markBackedUp } from './share';
import { setSetting } from '../db/repos/settingsRepo';
import { isLaterKarachiDay, nowIso } from '../lib/dates';

const HANDLE_DB = 'dukaan-auto-export';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'folder';

/** Setting key holding the ISO time of the last successful automatic write. */
export const LAST_AUTO_EXPORT = 'last_auto_export_at';
/** Setting key holding the chosen folder's display name, for the UI. */
export const AUTO_EXPORT_FOLDER = 'auto_export_folder';

interface FilePickerWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<
    FileSystemDirectoryHandle
  >;
}

/** Whether this browser can write into a folder without a tap each time. */
export function supportsAutoExport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as FilePickerWindow).showDirectoryPicker === 'function'
  );
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

/*
 * A directory handle is structured-cloneable, so IndexedDB is the only place it
 * can be kept across reloads — localStorage would stringify it into nothing.
 */
async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsAutoExport()) return null;
  const db = await openHandleDb();
  try {
    return await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      request.onsuccess = () =>
        resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

async function writeHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openHandleDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      const store = tx.objectStore(HANDLE_STORE);
      if (handle) store.put(handle, HANDLE_KEY);
      else store.delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
}

/**
 * Whether the stored handle is still usable.
 *
 * `prompt` means the browser will ask, which it can only do from a user
 * gesture — so the automatic path treats it as "not yet" and the UI re-asks.
 */
async function permissionFor(
  handle: FileSystemDirectoryHandle,
  interactive: boolean,
): Promise<boolean> {
  const capable = handle as PermissionCapableHandle;
  if (!capable.queryPermission) return true;
  const current = await capable.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return true;
  if (!interactive || !capable.requestPermission) return false;
  return (await capable.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/**
 * Asks for a folder and remembers it. Must be called from a user gesture.
 * Returns the folder name, or null if the shopkeeper backed out.
 */
export async function chooseAutoExportFolder(): Promise<string | null> {
  const picker = (window as unknown as FilePickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ mode: 'readwrite' });
    if (!(await permissionFor(handle, true))) return null;
    await writeHandle(handle);
    await setSetting(AUTO_EXPORT_FOLDER, handle.name);
    return handle.name;
  } catch (error) {
    // AbortError is the shopkeeper cancelling the picker, which is not a fault.
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

export async function forgetAutoExportFolder(): Promise<void> {
  await writeHandle(null);
  await setSetting(AUTO_EXPORT_FOLDER, '');
}

export type AutoExportResult =
  | 'written'
  /** Already done for this Karachi day. */
  | 'up-to-date'
  /** No folder chosen, or this browser has no folder API. */
  | 'not-configured'
  /** A folder is stored but the browser wants the permission re-granted. */
  | 'needs-permission'
  | 'failed';

/**
 * Writes today's copy into the chosen folder, once per Karachi day.
 *
 * Called on boot and never awaited by a render path — opening the till must not
 * wait on a file write, and a failure here is a state the UI reports quietly
 * rather than an error that interrupts a sale.
 */
export async function runDailyAutoExport(lastAt: string): Promise<AutoExportResult> {
  if (!supportsAutoExport()) return 'not-configured';
  const now = nowIso();
  if (!isLaterKarachiDay(now, lastAt || null)) return 'up-to-date';

  const handle = await readHandle();
  if (!handle) return 'not-configured';
  if (!(await permissionFor(handle, false))) return 'needs-permission';

  try {
    const file = await exportSqlite();
    const target = await handle.getFileHandle(file.name, { create: true });
    const writable = await target.createWritable();
    try {
      await writable.write(file.blob);
    } finally {
      await writable.close();
    }
    await setSetting(LAST_AUTO_EXPORT, now);
    // A folder the cloud client syncs is a real off-device backup, so this one
    // does count — unlike the OPFS archive, which lives beside the ledger.
    await markBackedUp();
    return 'written';
  } catch (error) {
    console.warn('[auto-export] daily copy failed', error);
    return 'failed';
  }
}
