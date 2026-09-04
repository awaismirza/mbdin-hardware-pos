/**
 * The JSON-backup wire format and the pure logic that turns a parsed backup
 * into transaction steps.
 *
 * This module has NO app dependencies on purpose: both the UI thread (via
 * backup/exporters.ts and backup/importer.ts) and the database worker import
 * it, and the worker must not pull in the Comlink client.
 */

import type { TxStep } from './api';

/** Every table the backup carries, in foreign-key-safe insert order. */
export const BACKUP_TABLES = [
  'meta',
  'settings',
  'categories',
  'products',
  'product_images',
  'customers',
  'customer_images',
  'sales',
  'sale_items',
  'ledger_entries',
  'stock_movements',
  'held_carts',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface JsonBackup {
  format: 'dukaan-backup';
  schemaVersion: number;
  exportedAt: string;
  shopName: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Base64 marker for BLOB columns. JSON has no binary type, and product and
 * customer photos are BLOBs — dropping them would make the JSON backup quietly
 * lossy, which is exactly the surprise a backup format must not have.
 */
export interface Base64Value {
  $b64: string;
}

export function isBase64Value(value: unknown): value is Base64Value {
  return typeof value === 'object' && value !== null && '$b64' in value;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked, because String.fromCharCode(...bytes) blows the stack on a photo.
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeValue(value: unknown): string | number | null | Uint8Array {
  if (value === null || value === undefined) return null;
  if (isBase64Value(value)) return fromBase64(value.$b64);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Turns a parsed backup into the steps of a single transaction: defer foreign
 * keys, empty every table (children first), then re-insert every row (parents
 * first), column-by-name so an older file simply omits columns it never had.
 *
 * Base64 BLOBs are decoded to `Uint8Array` here. When this runs in the worker
 * that decoding never crosses a message boundary; when it runs in a Node test
 * it is in-process. Either way the giant array of steps is never posted between
 * threads.
 */
export function buildRestoreSteps(backup: JsonBackup): TxStep[] {
  const steps: TxStep[] = [{ sql: 'PRAGMA defer_foreign_keys = ON' }];

  for (const table of [...BACKUP_TABLES].reverse()) {
    steps.push({ sql: `DELETE FROM ${table}` });
  }

  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table];
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const columns = Object.keys(row);
      if (columns.length === 0) continue;
      const placeholders = columns.map(() => '?').join(', ');
      steps.push({
        sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
        params: columns.map((column) => decodeValue(row[column])),
      });
    }
  }

  return steps;
}

/** True when the object at least looks like one of our JSON backups. */
export function looksLikeJsonBackup(value: unknown): value is JsonBackup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    typeof (value as JsonBackup).schemaVersion === 'number' &&
    'tables' in value &&
    typeof (value as JsonBackup).tables === 'object' &&
    (value as JsonBackup).tables !== null
  );
}
