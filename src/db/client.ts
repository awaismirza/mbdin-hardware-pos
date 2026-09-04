/**
 * The UI thread's typed handle on the database worker.
 *
 * Components never import this. Repositories do. Components call repositories.
 */

import * as Comlink from 'comlink';

import type {
  BackupSummary,
  DbApi,
  InitOptions,
  InitResult,
  SqlParam,
  TxStep,
  WriteResult,
} from './api';

export type { BackupSummary, InitResult, StorageMode } from './api';
export { lastIdOf } from './api';

/**
 * The worker's surface as Comlink sees it. Comlink's Remote<T> cannot carry a
 * method's own type parameters across the proxy, so `query` is declared
 * non-generic here and the generic lives on `db.query` below, where callers
 * actually name the row type.
 */
interface WorkerApi extends Omit<DbApi, 'query'> {
  query(sql: string, params?: SqlParam[]): Promise<unknown[]>;
  resetEverything(): Promise<void>;
}

let remote: Comlink.Remote<WorkerApi> | null = null;
let worker: Worker | null = null;
let ready: Promise<InitResult> | null = null;
let info: InitResult | null = null;

function connect(): Comlink.Remote<WorkerApi> {
  if (!remote) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'dukaan-db',
    });
    remote = Comlink.wrap<WorkerApi>(worker);
    releaseOnPageHide();
  }
  return remote;
}

let releaseArmed = false;

/**
 * Kill the worker as the page goes away.
 *
 * OPFS sync access handles are exclusive per file. If they are still held when
 * the next page boots — which is exactly what a reload looks like — that page
 * cannot open the ledger. The worker retries and recovers either way, but
 * terminating here turns a second of retrying into none.
 *
 * pagehide rather than beforeunload: beforeunload does not fire on mobile
 * Safari, and pagehide is the event that actually runs when a tablet's browser
 * discards the tab.
 */
function releaseOnPageHide(): void {
  if (releaseArmed || typeof window === 'undefined') return;
  releaseArmed = true;
  window.addEventListener('pagehide', (event) => {
    // A persisted pagehide means the page went into the back/forward cache and
    // may come back with its JavaScript intact; tearing the worker down there
    // would leave the app pointing at nothing.
    if (event.persisted) return;
    worker?.terminate();
    worker = null;
    remote = null;
    ready = null;
    info = null;
  });
}

/** Boots the database. Safe to call repeatedly; the first call wins. */
export function initDb(options: InitOptions = {}): Promise<InitResult> {
  if (!ready) {
    ready = connect()
      .init(options)
      .then((result) => {
        info = result;
        return result;
      })
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  return ready;
}

/** What init() reported, once it has resolved. Null before boot completes. */
export function dbInfo(): InitResult | null {
  return info;
}

/**
 * Tears the worker down and boots a fresh one. Used by the debug screen to
 * prove the fallback path works with OPFS forced off, and after a restore.
 */
export async function reopenDb(options: InitOptions = {}): Promise<InitResult> {
  worker?.terminate();
  worker = null;
  remote = null;
  ready = null;
  info = null;
  return initDb(options);
}

/** What a repository is allowed to do. The only data surface in the app. */
export interface DbGateway {
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  exec(sql: string, params?: SqlParam[]): Promise<WriteResult>;
  transaction(steps: TxStep[]): Promise<WriteResult[]>;
  exportBytes(): Promise<Uint8Array>;
  inspectBytes(bytes: Uint8Array): Promise<BackupSummary>;
  importBytes(bytes: Uint8Array): Promise<void>;
  restoreJson(backup: unknown): Promise<void>;
  vacuum(): Promise<void>;
  byteSize(): Promise<number>;
  resetEverything(): Promise<void>;
}

const workerGateway: DbGateway = {
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
    return connect().query(sql, params) as Promise<T[]>;
  },
  queryOne<T>(sql: string, params?: SqlParam[]): Promise<T | null> {
    return connect()
      .query(sql, params)
      .then((rows) => (rows as T[])[0] ?? null);
  },
  exec(sql: string, params?: SqlParam[]): Promise<WriteResult> {
    return connect().exec(sql, params);
  },
  transaction(steps: TxStep[]): Promise<WriteResult[]> {
    return connect().transaction(steps);
  },
  exportBytes(): Promise<Uint8Array> {
    return connect().exportBytes();
  },
  inspectBytes(bytes: Uint8Array): Promise<BackupSummary> {
    return connect().inspectBytes(bytes);
  },
  importBytes(bytes: Uint8Array): Promise<void> {
    return connect().importBytes(Comlink.transfer(bytes, [bytes.buffer]));
  },
  restoreJson(backup: unknown): Promise<void> {
    return connect().restoreJson(backup);
  },
  vacuum(): Promise<void> {
    return connect().vacuum();
  },
  byteSize(): Promise<number> {
    return connect().byteSize();
  },
  resetEverything(): Promise<void> {
    return connect().resetEverything();
  },
};

let gateway: DbGateway = workerGateway;

/**
 * The handle every repository imports.
 *
 * It delegates rather than being the worker gateway directly, so integration
 * tests can point the real repository code at an in-memory database in Node.
 * That matters: the SQL is the part worth testing, and a mocked repository
 * would prove nothing about a foreign key or a rolled-back sale.
 */
export const db: DbGateway = {
  query: (sql, params) => gateway.query(sql, params),
  queryOne: (sql, params) => gateway.queryOne(sql, params),
  exec: (sql, params) => gateway.exec(sql, params),
  transaction: (steps) => gateway.transaction(steps),
  exportBytes: () => gateway.exportBytes(),
  inspectBytes: (bytes) => gateway.inspectBytes(bytes),
  importBytes: (bytes) => gateway.importBytes(bytes),
  restoreJson: (backup) => gateway.restoreJson(backup),
  vacuum: () => gateway.vacuum(),
  byteSize: () => gateway.byteSize(),
  resetEverything: () => gateway.resetEverything(),
};

/** Tests only. Pass null to restore the worker-backed gateway. */
export function setDbGateway(next: DbGateway | null): void {
  gateway = next ?? workerGateway;
}
