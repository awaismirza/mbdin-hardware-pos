import { nowIso } from '../../lib/dates';
import { ADVANCE_INVOICE_SQL, NEXT_INVOICE_SQL } from '../../lib/invoice';
import { clampDiscount, lineTotal, roundQty, sumPaisa } from '../../lib/money';
import type { CartLine, PaymentMethod, Sale, SaleWithItems } from '../../types/domain';
import type { TxStep } from '../api';
import { db, lastIdOf } from '../client';
import { toSale, toSaleItem, type SaleItemRow, type SaleRow } from './rows';

export interface CompleteSaleInput {
  lines: CartLine[];
  customerId: number | null;
  discountPaisa: number;
  paidPaisa: number;
  paymentMethod: PaymentMethod;
  note?: string | null;
  /**
   * The open cart this sale is being rung from, cleared inside the same
   * transaction. Omitted only by tests that never opened one.
   */
  cartId?: number;
}

export interface CompletedSale {
  saleId: number;
  invoiceNo: string;
  totalPaisa: number;
  duePaisa: number;
}

export class EmptyCartError extends Error {}
export class CreditWithoutCustomerError extends Error {}

/**
 * Completing a sale. One transaction, all or nothing.
 *
 * The transaction writes, in order:
 *   0            the sales row, taking its invoice number from settings in SQL
 *   1..n         one sale_items row per line, with price and cost snapshotted
 *   then         one stock_movements row and one products update per stocked line
 *   then         a ledger charge, if any part of the total is unpaid
 *   then         the invoice counter advanced
 *   then         the live cart cleared
 *
 * Every step after the first refers to the sale by lastIdOf(0), which the
 * worker resolves inside the transaction. Nothing here can half-happen: a power
 * cut between the stock movement and the ledger charge rolls both back, and the
 * shopkeeper rings the sale again rather than finding a sale with no udhaar.
 */
export async function completeSale(input: CompleteSaleInput): Promise<CompletedSale> {
  const lines = input.lines.filter((line) => roundQty(line.qty) !== 0);
  if (lines.length === 0) throw new EmptyCartError('There is nothing in the cart');

  const now = nowIso();
  const subtotal = sumPaisa(lines.map((line) => lineTotal(line.pricePaisa, line.qty)));
  const discount = clampDiscount(subtotal, input.discountPaisa);
  const total = subtotal - discount;
  const paid = Math.min(Math.max(input.paidPaisa, 0), total);
  const due = total - paid;

  if (due > 0 && input.customerId === null) {
    throw new CreditWithoutCustomerError('Udhaar needs a customer');
  }

  const steps: TxStep[] = [
    {
      sql: `INSERT INTO sales
              (invoice_no, customer_id, subtotal_paisa, discount_paisa, total_paisa,
               paid_paisa, payment_method, status, note, created_at)
            VALUES (${NEXT_INVOICE_SQL}, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
      params: [
        input.customerId,
        subtotal,
        discount,
        total,
        paid,
        input.paymentMethod,
        input.note ?? null,
        now,
      ],
    },
  ];

  for (const line of lines) {
    const qty = roundQty(line.qty);
    steps.push({
      sql: `INSERT INTO sale_items
              (sale_id, product_id, name_snapshot, unit_snapshot, qty, price_paisa, cost_paisa, line_paisa)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [
        lastIdOf(0),
        line.productId,
        line.name,
        line.unit,
        qty,
        line.pricePaisa,
        line.costPaisa,
        lineTotal(line.pricePaisa, qty),
      ],
    });

    // A quick-sell line has no product behind it, so there is no stock to move.
    if (line.productId !== null) {
      steps.push({
        sql: `INSERT INTO stock_movements (product_id, kind, qty_delta, sale_id, note, created_at)
              VALUES (?, 'sale', ?, ?, NULL, ?)`,
        params: [line.productId, -qty, lastIdOf(0), now],
      });
      steps.push({
        sql: `UPDATE products SET stock_qty = ROUND(stock_qty - ?, 3), updated_at = ? WHERE id = ?`,
        params: [qty, now, line.productId],
      });
    }
  }

  if (due > 0 && input.customerId !== null) {
    steps.push({
      sql: `INSERT INTO ledger_entries
              (customer_id, sale_id, kind, amount_paisa, method, note, created_at)
            VALUES (?, ?, 'charge', ?, NULL, NULL, ?)`,
      params: [input.customerId, lastIdOf(0), due, now],
    });
  }

  steps.push({ sql: ADVANCE_INVOICE_SQL });
  // Clear exactly the cart this sale was rung from, in the same transaction, so
  // a sale and the disappearance of its cart can never come apart. The other
  // open carts are untouched.
  if (input.cartId !== undefined) {
    steps.push({
      sql: `DELETE FROM held_carts WHERE id = ? AND kind = 'active'`,
      params: [input.cartId],
    });
  }

  const results = await db.transaction(steps);
  const saleId = results[0]!.lastId;
  const sale = await db.queryOne<{ invoice_no: string }>(
    'SELECT invoice_no FROM sales WHERE id = ?',
    [saleId],
  );

  return { saleId, invoiceNo: sale?.invoice_no ?? '', totalPaisa: total, duePaisa: due };
}

/**
 * Voiding. The sale is never deleted: it stays in the book marked void, stock
 * goes back on the shelf as reversing movements, and a credit charge is undone
 * with a negative adjustment rather than by removing the original charge.
 */
export async function voidSale(saleId: number): Promise<void> {
  const sale = await getSale(saleId);
  if (!sale) throw new Error(`No sale ${saleId}`);
  if (sale.status === 'void') return;

  const now = nowIso();
  const steps: TxStep[] = [
    {
      sql: `UPDATE sales SET status = 'void', voided_at = ? WHERE id = ? AND status <> 'void'`,
      params: [now, saleId],
    },
  ];

  for (const item of sale.items) {
    if (item.productId === null) continue;
    steps.push({
      sql: `INSERT INTO stock_movements (product_id, kind, qty_delta, sale_id, note, created_at)
            VALUES (?, 'return', ?, ?, 'void', ?)`,
      params: [item.productId, item.qty, saleId, now],
    });
    steps.push({
      sql: `UPDATE products SET stock_qty = ROUND(stock_qty + ?, 3), updated_at = ? WHERE id = ?`,
      params: [item.qty, now, item.productId],
    });
  }

  // Reverse exactly what this sale charged, not what the customer owes now —
  // they may have paid some of it since, and that payment stands.
  const charged = await db.queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_paisa), 0) AS total
     FROM ledger_entries WHERE sale_id = ? AND kind = 'charge'`,
    [saleId],
  );
  if (sale.customerId !== null && (charged?.total ?? 0) !== 0) {
    steps.push({
      sql: `INSERT INTO ledger_entries
              (customer_id, sale_id, kind, amount_paisa, method, note, created_at)
            VALUES (?, ?, 'adjustment', ?, NULL, 'void', ?)`,
      params: [sale.customerId, saleId, -(charged?.total ?? 0), now],
    });
  }

  await db.transaction(steps);
}

export async function getSale(saleId: number): Promise<SaleWithItems | null> {
  const row = await db.queryOne<SaleRow>(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = ?`,
    [saleId],
  );
  if (!row) return null;

  const items = await db.query<SaleItemRow>(
    'SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id',
    [saleId],
  );

  return {
    ...toSale(row),
    items: items.map(toSaleItem),
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
  };
}

export async function listSales(from: string, to: string, limit = 500): Promise<Sale[]> {
  const rows = await db.query<SaleRow>(
    `SELECT * FROM sales
     WHERE created_at >= ? AND created_at < ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [from, to, limit],
  );
  return rows.map(toSale);
}

export async function listSalesForCustomer(customerId: number, limit = 100): Promise<Sale[]> {
  const rows = await db.query<SaleRow>(
    `SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [customerId, limit],
  );
  return rows.map(toSale);
}

// ---- Carts -----------------------------------------------------------------

export interface CartSnapshot {
  lines: CartLine[];
  customerId: number | null;
  discountPaisa: number;
}

export interface ActiveCart {
  /** The held_carts row id — stable for the life of the cart, and the tab key. */
  id: number;
  snapshot: CartSnapshot;
}

/**
 * The open carts.
 *
 * A busy counter serves several customers at once, so there are N carts, not
 * one, each an independent `kind = 'active'` row in held_carts. They are the
 * tabs on the Sell screen; there is no separate "hold" concept any more —
 * parking a basket just means opening another tab. Every cart is written to the
 * database after each change, so a power cut or a killed tab loses none of them,
 * and because held_carts is in BACKUP_TABLES they ride in a backup too.
 *
 * Ordered by id, i.e. by the order they were opened.
 */
export async function listActiveCarts(): Promise<ActiveCart[]> {
  const rows = await db.query<{ id: number; payload: string }>(
    `SELECT id, payload FROM held_carts WHERE kind = 'active' ORDER BY id`,
  );
  const carts: ActiveCart[] = [];
  for (const row of rows) {
    const snapshot = parseSnapshot(row.payload);
    // A corrupt row is skipped rather than allowed to take the screen down.
    if (snapshot) carts.push({ id: row.id, snapshot });
  }
  return carts;
}

const EMPTY_SNAPSHOT: CartSnapshot = { lines: [], customerId: null, discountPaisa: 0 };

/** Opens a new cart and returns its id. */
export async function createCart(snapshot: CartSnapshot = EMPTY_SNAPSHOT): Promise<number> {
  const now = nowIso();
  const result = await db.exec(
    `INSERT INTO held_carts (label, payload, kind, created_at, updated_at)
     VALUES (NULL, ?, 'active', ?, ?)`,
    [JSON.stringify(snapshot), now, now],
  );
  return result.lastId;
}

/** Overwrites one cart's contents. Fire-and-forget from the store. */
export async function saveCart(id: number, snapshot: CartSnapshot): Promise<void> {
  await db.exec(
    `UPDATE held_carts SET payload = ?, updated_at = ? WHERE id = ? AND kind = 'active'`,
    [JSON.stringify(snapshot), nowIso(), id],
  );
}

export async function deleteCart(id: number): Promise<void> {
  await db.exec(`DELETE FROM held_carts WHERE id = ? AND kind = 'active'`, [id]);
}

/** A corrupt payload must not stop the app opening; treat it as no cart. */
function parseSnapshot(payload: string): CartSnapshot | null {
  try {
    const parsed = JSON.parse(payload) as CartSnapshot;
    if (!Array.isArray(parsed.lines)) return null;
    return {
      lines: parsed.lines,
      customerId: parsed.customerId ?? null,
      discountPaisa: parsed.discountPaisa ?? 0,
    };
  } catch {
    console.warn('[cart] ignoring an unreadable saved cart');
    return null;
  }
}
