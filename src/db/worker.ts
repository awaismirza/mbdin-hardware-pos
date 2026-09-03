/// <reference lib="webworker" />
/**
 * The database worker. This is the only place in the app that touches SQLite.
 *
 * ── Storage strategy ────────────────────────────────────────────────────────
 *
 * Primary: the `opfs-sahpool` VFS. SQLite gets a pool of OPFS sync access
 * handles and drives them synchronously inside this worker. It needs no
 * SharedArrayBuffer, therefore no COOP/COEP headers, therefore the app deploys
 * to any static host — which is the requirement that decides this.
 *
 * Note this is NOT the `opfs` VFS (sqlite3.oo1.OpfsDb). That one proxies to an
 * async worker via Atomics.wait on a SharedArrayBuffer and *does* require
 * cross-origin isolation; on a plain static host it fails to install. The
 * spec's "async proxy avoids the requirement" has it the wrong way round.
 *
 * sahpool's constraints, and why they are acceptable here:
 *   - One connection at a time. This is one shop on one tablet in one tab.
 *   - Files sit under opaque pool names, not readable as normal OPFS files.
 *     Backups therefore go out via sqlite3_js_db_export(), never by reading
 *     the file — which is what backup/exporters.ts does anyway.
 *
 * Fallback: the same engine on an in-memory database, serialised to IndexedDB
 * after every write transaction. The spec suggested sql.js for this; using the
 * one WASM build we already ship means identical SQL semantics in both modes
 * and one less dependency to keep offline.
 */

import * as Comlink from 'comlink';
import sqlite3InitModule, { type Sqlite3Static, type Database } from '@sqlite.org/sqlite-wasm';

import type { DbApi, InitOptions, InitResult, SqlParam, TxStep, WriteResult } from './api';
import { Engine, type SqliteHandle } from './engine';
import { clearImage, loadImage, saveImage } from './idbStore';

const DB_FILENAME = '/dukaan.sqlite3';

let sqlite3: Sqlite3Static | null = null;
let engine: Engine | null = null;
let handle: Database | null = null;
let mode: 'opfs' | 'idb' = 'opfs';
let poolUtil: Awaited<ReturnType<Sqlite3Static['installOpfsSAHPoolVfs']>> | null = null;
let initPromise: Promise<InitResult> | null = null;

function requireEngine(): Engine {
  if (!engine) throw new Error('Database is not open. Call init() first.');
  return engine;
}

async function loadSqlite(): Promise<Sqlite3Static> {
  if (!sqlite3) {
    sqlite3 = await sqlite3InitModule({
      print: () => {},
      printErr: (message: string) => console.error('[sqlite]', message),
    });
  }
  return sqlite3;
}

function exportOf(db: Database): () => Uint8Array {
  return () => sqlite3!.capi.sqlite3_js_db_export(db);
}

/**
 * Raised when OPFS exists but its access handles are held by someone else —
 * usually the previous page of a reload that has not finished dying, sometimes
 * a second tab. This is NOT a reason to fall back: see openOpfs().
 */
export class OpfsBusyError extends Error {
  readonly kind = 'opfs-busy';
}

const OPFS_ATTEMPTS = 12;
const OPFS_RETRY_MS = 150;

/**
 * Opens on opfs-sahpool.
 *
 * The retry loop is load-bearing, not defensive padding. A sync access handle
 * is exclusive per file, and on a reload the outgoing page's worker can still
 * hold the pool for a few hundred milliseconds. Without the retry the pool
 * looks unavailable and the app quietly opens the *IndexedDB* database
 * instead — a different, empty book. The shopkeeper reloads, sees an empty
 * shop, and starts selling into a second ledger. So: retry while it is merely
 * busy, and if it stays busy, fail loudly rather than open the wrong file.
 */
async function openOpfs(api: Sqlite3Static): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this browser');
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < OPFS_ATTEMPTS; attempt += 1) {
    try {
      poolUtil = await api.installOpfsSAHPoolVfs({
        name: 'dukaan-pool',
        directory: '.dukaan-sahpool',
        // Two databases' worth of handles plus journals plus headroom for a
        // restore, which briefly needs a second file.
        initialCapacity: 8,
        // Without this, a failed first attempt is cached by name and every
        // retry replays the same rejection. The option is implemented in
        // sqlite-wasm 3.50 but missing from its .d.ts, hence the cast.
        forceReinitIfPreviouslyFailed: true,
      } as Parameters<Sqlite3Static['installOpfsSAHPoolVfs']>[0]);
      break;
    } catch (error) {
      lastError = error;
      if (!isBusyError(error)) throw error;
      await sleep(OPFS_RETRY_MS * (attempt + 1));
    }
  }

  if (!poolUtil) {
    throw new OpfsBusyError(
      'Dukaan is already open in another tab or window. Close it, then try again.' +
        ` (${describeError(lastError)})`,
    );
  }

  handle = new poolUtil.OpfsSAHPoolDb(DB_FILENAME);
  mode = 'opfs';
  engine = new Engine({ db: handle as unknown as SqliteHandle, exportBytes: exportOf(handle) });
}

/** A locked access handle, as opposed to OPFS genuinely not being there. */
function isBusyError(error: unknown): boolean {
  const message = describeError(error);
  return (
    message.includes('NoModificationAllowedError') ||
    message.includes('Access Handles cannot be created') ||
    message.includes('createSyncAccessHandle') ||
    message.includes('modifications are not allowed')
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Opens in memory and hydrates from IndexedDB, persisting after every write. */
async function openIdb(api: Sqlite3Static): Promise<void> {
  const saved = await loadImage();
  handle = new api.oo1.DB(':memory:', 'c');

  if (saved && saved.byteLength > 0) {
    deserialiseInto(api, handle, saved);
  }

  mode = 'idb';
  const db = handle;
  engine = new Engine({
    db: db as unknown as SqliteHandle,
    exportBytes: exportOf(db),
    afterWrite: async () => {
      await saveImage(api.capi.sqlite3_js_db_export(db));
    },
  });
}

/** Replaces the contents of an in-memory database with a serialised image. */
function deserialiseInto(api: Sqlite3Static, db: Database, bytes: Uint8Array): void {
  const pointer = api.wasm.allocFromTypedArray(bytes);
  const rc = api.capi.sqlite3_deserialize(
    db.pointer!,
    'main',
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    api.capi.SQLITE_DESERIALIZE_FREEONCLOSE | api.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  db.checkRc(rc);
}

const api: DbApi = {
  async init(options: InitOptions = {}): Promise<InitResult> {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const sqlite = await loadSqlite();
      let fallbackReason: string | undefined;

      if (options.forceMode === 'idb') {
        fallbackReason = 'Forced by the debug screen';
        await openIdb(sqlite);
      } else {
        try {
          await openOpfs(sqlite);
        } catch (error) {
          // A busy pool means the right database exists and is momentarily
          // locked. Opening the fallback here would silently hand the user an
          // empty ledger, so this error is surfaced instead.
          if (error instanceof OpfsBusyError || options.forceMode === 'opfs') throw error;
          fallbackReason = error instanceof Error ? error.message : String(error);
          console.warn('[db] OPFS unavailable, falling back to IndexedDB:', fallbackReason);
          await openIdb(sqlite);
        }
      }

      const schemaVersion = await requireEngine().open();
      await api.exec(`INSERT INTO meta(key, value) VALUES('storage_mode', ?)
                      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [mode]);

      const result: InitResult = {
        mode,
        schemaVersion,
        sqliteVersion: sqlite.version.libVersion,
      };
      if (fallbackReason) result.fallbackReason = fallbackReason;
      return result;
    })();

    try {
      return await initPromise;
    } catch (error) {
      initPromise = null; // let the UI retry rather than wedging forever
      throw error;
    }
  },

  async query<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return requireEngine().query<T>(sql, params);
  },

  async exec(sql: string, params: SqlParam[] = []): Promise<WriteResult> {
    return requireEngine().exec(sql, params);
  },

  async transaction(steps: TxStep[]): Promise<WriteResult[]> {
    return requireEngine().transaction(steps);
  },

  async exportBytes(): Promise<Uint8Array> {
    // Copy out of WASM memory before it crosses the Comlink boundary.
    return requireEngine().exportBytes().slice();
  },

  /**
   * Replaces the live database with `bytes`. The caller is responsible for
   * having written a pre-restore safety copy first — see backup/importer.ts,
   * which will not call this without one.
   */
  async importBytes(bytes: Uint8Array): Promise<void> {
    const sqlite = await loadSqlite();
    assertSqliteImage(bytes);

    if (mode === 'opfs') {
      if (!poolUtil) throw new Error('OPFS pool is not installed');
      engine?.close();
      engine = null;
      handle = null;
      await poolUtil.importDb(DB_FILENAME, bytes);
      handle = new poolUtil.OpfsSAHPoolDb(DB_FILENAME);
      engine = new Engine({
        db: handle as unknown as SqliteHandle,
        exportBytes: exportOf(handle),
      });
    } else {
      engine?.close();
      engine = null;
      handle = new sqlite.oo1.DB(':memory:', 'c');
      deserialiseInto(sqlite, handle, bytes);
      const db = handle;
      engine = new Engine({
        db: db as unknown as SqliteHandle,
        exportBytes: exportOf(db),
        afterWrite: async () => {
          await saveImage(sqlite.capi.sqlite3_js_db_export(db));
        },
      });
      await saveImage(sqlite.capi.sqlite3_js_db_export(db));
    }

    // An older file is migrated forward; a newer one throws, and the caller
    // restores the pre-restore copy.
    await requireEngine().open();
  },

  async vacuum(): Promise<void> {
    await requireEngine().vacuum();
  },

  async byteSize(): Promise<number> {
    return requireEngine().byteSize();
  },
};

/** Every SQLite file starts with this 16-byte string. Cheap, decisive. */
const SQLITE_MAGIC = 'SQLite format 3 ';

export function assertSqliteImage(bytes: Uint8Array): void {
  if (bytes.byteLength < 512) {
    throw new Error('That file is too small to be a Dukaan backup.');
  }
  const header = new TextDecoder('utf-8').decode(bytes.subarray(0, 16));
  if (header !== SQLITE_MAGIC) {
    throw new Error(
      'Backup file not recognised. Choose a .sqlite3 or .json file exported from Dukaan.',
    );
  }
  // Page size lives at offset 16 as a big-endian u16; 1 means 65536.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pageSizeField = view.getUint16(16);
  const pageSize = pageSizeField === 1 ? 65536 : pageSizeField;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) {
    throw new Error('That backup file is damaged and cannot be restored.');
  }
  if (bytes.byteLength % pageSize !== 0) {
    throw new Error('That backup file is incomplete. It may have been cut short while copying.');
  }
}

/** Wipes everything, including the fallback image. Settings screen only. */
export async function resetEverything(): Promise<void> {
  engine?.close();
  engine = null;
  handle = null;
  initPromise = null;
  if (mode === 'opfs' && poolUtil) {
    await poolUtil.wipeFiles();
  }
  await clearImage().catch(() => {});
}

Comlink.expose({ ...api, resetEverything });
