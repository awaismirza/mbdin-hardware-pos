/**
 * Export formats.
 *
 *   .sqlite3  byte-exact database. The real backup — restores perfectly.
 *   .json     every table plus a schemaVersion header. Portable, inspectable,
 *             survives a change of stack.
 *   .csv      one file per table, for Excel and for the accountant.
 */

import { db } from '../db/client';
import { BACKUP_TABLES, toBase64, type JsonBackup } from '../db/jsonRestore';
import { LATEST_SCHEMA_VERSION } from '../db/migrations';
import { getAllSettings, shopSlug } from '../db/repos/settingsRepo';
import { toCsv } from '../lib/csv';
import { fileStamp } from '../lib/dates';
import { paisaToRupeeString } from '../lib/money';

export type ExportFormat = 'sqlite' | 'json' | 'csv';

export interface ExportedFile {
  name: string;
  type: string;
  blob: Blob;
}

export { BACKUP_TABLES, toBase64, fromBase64, isBase64Value } from '../db/jsonRestore';
export type { BackupTable, JsonBackup } from '../db/jsonRestore';

export async function backupFilename(extension: string): Promise<string> {
  const settings = await getAllSettings();
  return `dukaan-${shopSlug(settings['shop_name'] ?? '')}-${fileStamp()}.${extension}`;
}

export async function exportSqlite(): Promise<ExportedFile> {
  const bytes = await db.exportBytes();
  return {
    name: await backupFilename('sqlite3'),
    type: 'application/vnd.sqlite3',
    // Copy into a plain buffer: the view may be over a larger allocation.
    blob: new Blob([bytes.slice()], { type: 'application/vnd.sqlite3' }),
  };
}

export async function buildJsonBackup(): Promise<JsonBackup> {
  const settings = await getAllSettings();
  const tables: Record<string, Record<string, unknown>[]> = {};

  for (const table of BACKUP_TABLES) {
    const rows = await db.query<Record<string, unknown>>(`SELECT * FROM ${table}`);
    tables[table] = rows.map(encodeRow);
  }

  return {
    format: 'dukaan-backup',
    schemaVersion: LATEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    shopName: settings['shop_name'] ?? '',
    tables,
  };
}

export async function exportJson(): Promise<ExportedFile> {
  const backup = await buildJsonBackup();
  return {
    name: await backupFilename('json'),
    type: 'application/json',
    blob: new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  };
}

function encodeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Uint8Array ? { $b64: toBase64(value) } : value;
  }
  return out;
}

// ---- CSV -------------------------------------------------------------------

export interface CsvExport {
  name: string;
  text: string;
}

/**
 * One CSV per table a human would want to read. Money is written in rupees,
 * not paisa: the file is for a person with a spreadsheet, and a column of
 * 25050 that means Rs 250.50 is a trap.
 */
export async function exportCsvFiles(): Promise<CsvExport[]> {
  const stamp = fileStamp();
  const settings = await getAllSettings();
  const slug = shopSlug(settings['shop_name'] ?? '');
  const named = (part: string) => `dukaan-${slug}-${part}-${stamp}.csv`;

  const products = await db.query<Record<string, never>>(`
    SELECT p.id, p.sku, p.barcode, p.name_ur, p.name_en,
           c.name_en AS category, p.unit, p.cost_paisa, p.price_paisa,
           p.stock_qty, p.low_stock_threshold, p.is_active, p.created_at
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.id`);

  const customers = await db.query<Record<string, never>>(`
    SELECT c.id, c.name, c.phone, c.address, c.credit_limit_paisa,
           COALESCE((SELECT SUM(l.amount_paisa) FROM ledger_entries l WHERE l.customer_id = c.id), 0)
             AS balance_paisa,
           c.created_at
    FROM customers c ORDER BY c.id`);

  const sales = await db.query<Record<string, never>>(`
    SELECT s.id, s.invoice_no, s.created_at, c.name AS customer,
           s.subtotal_paisa, s.discount_paisa, s.total_paisa, s.paid_paisa,
           s.payment_method, s.status, s.note
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.id`);

  const saleItems = await db.query<Record<string, never>>(`
    SELECT i.id, i.sale_id, s.invoice_no, s.created_at, i.name_snapshot, i.unit_snapshot,
           i.qty, i.price_paisa, i.cost_paisa, i.line_paisa
    FROM sale_items i JOIN sales s ON s.id = i.sale_id
    ORDER BY i.id`);

  const ledger = await db.query<Record<string, never>>(`
    SELECT l.id, l.created_at, c.name AS customer, l.kind, l.amount_paisa,
           l.method, s.invoice_no, l.note
    FROM ledger_entries l
    JOIN customers c ON c.id = l.customer_id
    LEFT JOIN sales s ON s.id = l.sale_id
    ORDER BY l.id`);

  return [
    { name: named('products'), text: rowsToCsv(products) },
    { name: named('customers'), text: rowsToCsv(customers) },
    { name: named('sales'), text: rowsToCsv(sales) },
    { name: named('sale-items'), text: rowsToCsv(saleItems) },
    { name: named('ledger'), text: rowsToCsv(ledger) },
  ];
}

/** Turns rows into CSV, renaming *_paisa columns and converting to rupees. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return toCsv([['(no rows)']]);

  const keys = Object.keys(rows[0]!);
  const headers = keys.map((key) => (key.endsWith('_paisa') ? key.replace('_paisa', '_rs') : key));

  const body = rows.map((row) =>
    keys.map((key) => {
      const value = row[key];
      if (key.endsWith('_paisa') && typeof value === 'number') return paisaToRupeeString(value);
      if (value instanceof Uint8Array) return `<${String(value.byteLength)} bytes>`;
      return value as string | number | null;
    }),
  );

  return toCsv([headers, ...body]);
}
