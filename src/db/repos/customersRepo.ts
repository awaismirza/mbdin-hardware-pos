import { nowIso } from '../../lib/dates';
import type { CustomerWithBalance } from '../../types/domain';
import { db } from '../client';
import { toCustomer, type CustomerRow } from './rows';

/**
 * A customer's balance is derived, every time, from the ledger:
 *
 *   SELECT COALESCE(SUM(amount_paisa), 0) FROM ledger_entries WHERE customer_id = ?
 *
 * There is deliberately no balance column anywhere. A cached balance drifts the
 * first time a write half-succeeds, and a drifted udhaar book is worse than no
 * udhaar book — the shopkeeper stops trusting the app and goes back to paper.
 */
const BALANCE = `
  (SELECT COALESCE(SUM(l.amount_paisa), 0)
   FROM ledger_entries l WHERE l.customer_id = c.id)`;

const SELECT_CUSTOMER = `
  SELECT c.*, ${BALANCE} AS balance_paisa,
         EXISTS(SELECT 1 FROM customer_images i WHERE i.customer_id = c.id) AS has_photo
  FROM customers c`;

export interface CustomerQuery {
  search?: string;
  /** Only people who owe money. Used by the reminder list. */
  owingOnly?: boolean;
  limit?: number;
}

/**
 * Sorted by outstanding balance descending, because that is the question the
 * shopkeeper opens this screen to answer.
 */
export async function listCustomers(query: CustomerQuery = {}): Promise<CustomerWithBalance[]> {
  const { search = '', owingOnly = false, limit = 500 } = query;
  const term = search.trim();

  const where = ['c.is_active = 1'];
  if (term) where.push('(c.name LIKE ?1 OR c.phone LIKE ?1)');
  if (owingOnly) where.push(`${BALANCE} > 0`);

  const rows = await db.query<CustomerRow>(
    `${SELECT_CUSTOMER}
     WHERE ${where.join(' AND ')}
     ORDER BY balance_paisa DESC, c.name COLLATE NOCASE
     LIMIT ?2`,
    [`%${term}%`, limit],
  );
  return rows.map(withBalance);
}

export async function getCustomer(id: number): Promise<CustomerWithBalance | null> {
  const row = await db.queryOne<CustomerRow>(
    `${SELECT_CUSTOMER} WHERE c.id = ?`,
    [id],
  );
  return row ? withBalance(row) : null;
}

export async function getBalance(customerId: number): Promise<number> {
  const row = await db.queryOne<{ balance_paisa: number }>(
    `SELECT COALESCE(SUM(amount_paisa), 0) AS balance_paisa
     FROM ledger_entries WHERE customer_id = ?`,
    [customerId],
  );
  return row?.balance_paisa ?? 0;
}

export interface CustomerDraft {
  id?: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  creditLimitPaisa?: number;
  isActive?: boolean;
}

export async function createCustomer(draft: CustomerDraft): Promise<number> {
  const name = draft.name.trim();
  if (!name) throw new Error('A customer needs a name');
  const now = nowIso();
  const result = await db.exec(
    `INSERT INTO customers (name, phone, address, notes, credit_limit_paisa, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      name,
      blankToNull(draft.phone),
      blankToNull(draft.address),
      blankToNull(draft.notes),
      draft.creditLimitPaisa ?? 0,
      draft.isActive === false ? 0 : 1,
      now,
      now,
    ],
  );
  return result.lastId;
}

export async function updateCustomer(draft: CustomerDraft & { id: number }): Promise<void> {
  const name = draft.name.trim();
  if (!name) throw new Error('A customer needs a name');
  await db.exec(
    `UPDATE customers SET name = ?, phone = ?, address = ?, notes = ?,
       credit_limit_paisa = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      blankToNull(draft.phone),
      blankToNull(draft.address),
      blankToNull(draft.notes),
      draft.creditLimitPaisa ?? 0,
      draft.isActive === false ? 0 : 1,
      nowIso(),
      draft.id,
    ],
  );
}

/** Total owed across every customer, for the Reports screen. */
export async function totalOutstanding(): Promise<number> {
  const row = await db.queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_paisa), 0) AS total FROM ledger_entries`,
  );
  return row?.total ?? 0;
}

function withBalance(row: CustomerRow): CustomerWithBalance {
  return { ...toCustomer(row), balancePaisa: row.balance_paisa ?? 0 };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export interface StoredCustomerPhoto {
  mime: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export async function getCustomerPhoto(customerId: number): Promise<StoredCustomerPhoto | null> {
  const row = await db.queryOne<StoredCustomerPhoto>(
    'SELECT mime, width, height, bytes FROM customer_images WHERE customer_id = ?',
    [customerId],
  );
  return row;
}

export async function setCustomerPhoto(
  customerId: number,
  photo: StoredCustomerPhoto,
): Promise<void> {
  await db.exec(
    `INSERT INTO customer_images (customer_id, mime, width, height, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(customer_id) DO UPDATE SET
       mime = excluded.mime, width = excluded.width, height = excluded.height,
       bytes = excluded.bytes, created_at = excluded.created_at`,
    [customerId, photo.mime, photo.width, photo.height, photo.bytes, nowIso()],
  );
}

export async function deleteCustomerPhoto(customerId: number): Promise<void> {
  await db.exec('DELETE FROM customer_images WHERE customer_id = ?', [customerId]);
}
