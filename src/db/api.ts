/**
 * The contract between the UI thread and the database worker.
 *
 * Everything here has to survive structured cloning: Comlink posts these values
 * across a MessagePort. No functions, no class instances, no Dates.
 */

export type StorageMode = 'opfs' | 'idb';

export type SqlPrimitive = null | number | string | boolean | Uint8Array;

/**
 * A reference to the rowid a previous step in the same transaction inserted.
 *
 * Completing a sale has to write the sales row and then its sale_items,
 * stock_movements and ledger_entries — all of which need the sale's id — inside
 * a single transaction. Since transaction steps cross a worker boundary as
 * plain data, they cannot close over a JavaScript variable. This placeholder is
 * resolved inside the worker, after the referenced step has run.
 */
export interface LastIdRef {
  readonly __lastIdOfStep: number;
}

export type SqlParam = SqlPrimitive | LastIdRef;

/** Reference the id inserted by step `stepIndex` (zero-based) of this transaction. */
export function lastIdOf(stepIndex: number): LastIdRef {
  return { __lastIdOfStep: stepIndex };
}

export function isLastIdRef(value: unknown): value is LastIdRef {
  return typeof value === 'object' && value !== null && '__lastIdOfStep' in value;
}

export interface TxStep {
  sql: string;
  params?: SqlParam[];
}

export interface WriteResult {
  changes: number;
  lastId: number;
}

export interface InitResult {
  mode: StorageMode;
  schemaVersion: number;
  /** Present when the preferred OPFS path was tried and failed. */
  fallbackReason?: string;
  sqliteVersion: string;
}

export interface InitOptions {
  /** Force a storage mode. Used by the debug screen to prove both paths work. */
  forceMode?: StorageMode;
}

/** What a candidate backup file turns out to contain. */
export interface BackupSummary {
  schemaVersion: number;
  products: number;
  sales: number;
  customers: number;
  ledgerEntries: number;
  createdAt: string | null;
  shopName: string | null;
}

export interface DbApi {
  init(options?: InitOptions): Promise<InitResult>;
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  exec(sql: string, params?: SqlParam[]): Promise<WriteResult>;
  /** Runs every step in one transaction. Any throw rolls the whole thing back. */
  transaction(steps: TxStep[]): Promise<WriteResult[]>;
  exportBytes(): Promise<Uint8Array>;
  /**
   * Opens a candidate backup in a throwaway database and reports what is in it,
   * without touching the live one. This is what the restore confirmation counts
   * come from — the user is told what they are about to replace, using the
   * incoming file's own numbers.
   */
  inspectBytes(bytes: Uint8Array): Promise<BackupSummary>;
  importBytes(bytes: Uint8Array): Promise<void>;
  /**
   * Replaces every table's contents from a parsed JSON backup, in one
   * transaction. The parsed object crosses the worker boundary once as plain
   * JSON — the base64 BLOBs are decoded to bytes on this side, so a large
   * backup with photos is never posted as a giant array of bound statements.
   */
  restoreJson(backup: unknown): Promise<void>;
  vacuum(): Promise<void>;
  /** Byte size of the database as it stands, for the Settings screen. */
  byteSize(): Promise<number>;
}
