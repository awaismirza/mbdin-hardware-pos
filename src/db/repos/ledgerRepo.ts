import { nowIso } from '../../lib/dates';
import type { LedgerEntryWithRunning, TenderMethod } from '../../types/domain';
import { db } from '../client';
import { toLedgerEntry, type LedgerRow } from './rows';

/**
 * The udhaar book.
 *
 * Sign convention, everywhere: positive is owed to the shop, negative is paid
 * or forgiven. A sale on credit writes a positive `charge`; a payment writes a
 * negative `payment`; voiding a credit sale writes a negative `adjustment`
 * rather than deleting anything, because the book is a history and history does
 * not get erased.
 */

/**
 * A customer's entries oldest first, each with the running balance after it —
 * which is how a paper ledger reads, and the only way a shopkeeper can check
 * the arithmetic by eye.
 */
export async function listLedger(customerId: number): Promise<LedgerEntryWithRunning[]> {
  const rows = await db.query<LedgerRow>(
    `SELECT l.*, s.invoice_no
     FROM ledger_entries l
     LEFT JOIN sales s ON s.id = l.sale_id
     WHERE l.customer_id = ?
     ORDER BY l.created_at, l.id`,
    [customerId],
  );

  let running = 0;
  return rows.map((row) => {
    running += row.amount_paisa;
    return {
      ...toLedgerEntry(row),
      runningPaisa: running,
      invoiceNo: row.invoice_no ?? null,
    };
  });
}

export interface PaymentInput {
  customerId: number;
  amountPaisa: number;
  method: TenderMethod;
  note?: string | null;
}

/** Records money coming back in. Stored negative; callers pass a positive amount. */
export async function takePayment(input: PaymentInput): Promise<number> {
  if (input.amountPaisa <= 0) throw new Error('A payment must be more than zero');
  const result = await db.exec(
    `INSERT INTO ledger_entries (customer_id, sale_id, kind, amount_paisa, method, note, created_at)
     VALUES (?, NULL, 'payment', ?, ?, ?, ?)`,
    [input.customerId, -input.amountPaisa, input.method, input.note ?? null, nowIso()],
  );
  return result.lastId;
}

/**
 * A manual correction. Positive adds to what the customer owes, negative writes
 * it off — which is how a shopkeeper forgives the last fifty rupees of a
 * balance without pretending the charge never happened.
 */
export async function adjustBalance(
  customerId: number,
  amountPaisa: number,
  note: string,
): Promise<number> {
  if (amountPaisa === 0) throw new Error('An adjustment of zero would say nothing');
  const result = await db.exec(
    `INSERT INTO ledger_entries (customer_id, sale_id, kind, amount_paisa, method, note, created_at)
     VALUES (?, NULL, 'adjustment', ?, NULL, ?, ?)`,
    [customerId, amountPaisa, note, nowIso()],
  );
  return result.lastId;
}

export interface Debtor {
  id: number;
  name: string;
  phone: string | null;
  balancePaisa: number;
}

export async function topDebtors(limit = 5): Promise<Debtor[]> {
  const rows = await db.query<{
    id: number;
    name: string;
    phone: string | null;
    balance_paisa: number;
  }>(
    `SELECT c.id, c.name, c.phone,
            COALESCE(SUM(l.amount_paisa), 0) AS balance_paisa
     FROM customers c
     JOIN ledger_entries l ON l.customer_id = c.id
     GROUP BY c.id
     HAVING balance_paisa > 0
     ORDER BY balance_paisa DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    balancePaisa: row.balance_paisa,
  }));
}

/** Payments received in a period, as a positive figure, for Reports. */
export async function paymentsReceived(from: string, to: string): Promise<number> {
  const row = await db.queryOne<{ total: number }>(
    `SELECT COALESCE(-SUM(amount_paisa), 0) AS total
     FROM ledger_entries
     WHERE kind = 'payment' AND created_at >= ? AND created_at < ?`,
    [from, to],
  );
  return row?.total ?? 0;
}

/** Credit extended in a period, for Reports. */
export async function creditGiven(from: string, to: string): Promise<number> {
  const row = await db.queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_paisa), 0) AS total
     FROM ledger_entries
     WHERE kind = 'charge' AND created_at >= ? AND created_at < ?`,
    [from, to],
  );
  return row?.total ?? 0;
}
