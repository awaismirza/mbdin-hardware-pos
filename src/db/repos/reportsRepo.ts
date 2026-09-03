import { shopOffsetModifier, type DateRange } from '../../lib/dates';
import { db } from '../client';

/**
 * Reports.
 *
 * Every figure here excludes voided sales, without exception. A void is not a
 * deletion — the row stays in the book — so any query that forgets
 * `status = 'completed'` silently inflates the day's takings, and the
 * shopkeeper's own count of the cash drawer stops matching the app.
 */
const COMPLETED = `status = 'completed'`;

export interface DaySummary {
  saleCount: number;
  grossPaisa: number;
  discountPaisa: number;
  /** Money that actually arrived: the paid part of every completed sale. */
  cashPaisa: number;
  /** The unpaid part of completed sales, i.e. new udhaar written today. */
  creditGivenPaisa: number;
  /** Old udhaar coming back in, from ledger payments. */
  paymentsReceivedPaisa: number;
  /** Selling price less the cost snapshotted at the time of sale. */
  profitPaisa: number;
  voidedCount: number;
}

export async function summary(range: DateRange): Promise<DaySummary> {
  const sales = await db.queryOne<{
    n: number;
    gross: number;
    discount: number;
    paid: number;
  }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(total_paisa), 0)    AS gross,
            COALESCE(SUM(discount_paisa), 0) AS discount,
            COALESCE(SUM(paid_paisa), 0)     AS paid
     FROM sales
     WHERE ${COMPLETED} AND created_at >= ? AND created_at < ?`,
    [range.from, range.to],
  );

  const voided = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sales
     WHERE status = 'void' AND created_at >= ? AND created_at < ?`,
    [range.from, range.to],
  );

  // Profit is computed from the line snapshots, not from today's cost price:
  // what a tin of ghee cost last Tuesday is what last Tuesday's margin was.
  // The discount is subtracted at the sale level because it applies to the
  // whole basket, not to any one line.
  const margin = await db.queryOne<{ margin: number }>(
    `SELECT COALESCE(SUM(i.line_paisa - CAST(ROUND(i.cost_paisa * i.qty) AS INTEGER)), 0) AS margin
     FROM sale_items i
     JOIN sales s ON s.id = i.sale_id
     WHERE s.${COMPLETED} AND s.created_at >= ? AND s.created_at < ?`,
    [range.from, range.to],
  );

  const payments = await db.queryOne<{ total: number }>(
    `SELECT COALESCE(-SUM(amount_paisa), 0) AS total
     FROM ledger_entries
     WHERE kind = 'payment' AND created_at >= ? AND created_at < ?`,
    [range.from, range.to],
  );

  const gross = sales?.gross ?? 0;
  const paid = sales?.paid ?? 0;

  return {
    saleCount: sales?.n ?? 0,
    grossPaisa: gross,
    discountPaisa: sales?.discount ?? 0,
    cashPaisa: paid,
    creditGivenPaisa: gross - paid,
    paymentsReceivedPaisa: payments?.total ?? 0,
    profitPaisa: (margin?.margin ?? 0) - (sales?.discount ?? 0),
    voidedCount: voided?.n ?? 0,
  };
}

export interface TopProduct {
  productId: number | null;
  name: string;
  qty: number;
  revenuePaisa: number;
}

export async function topProducts(
  range: DateRange,
  by: 'revenue' | 'qty',
  limit = 10,
): Promise<TopProduct[]> {
  const order = by === 'revenue' ? 'revenue_paisa DESC' : 'qty DESC';
  const rows = await db.query<{
    product_id: number | null;
    name: string;
    qty: number;
    revenue_paisa: number;
  }>(
    `SELECT i.product_id,
            i.name_snapshot AS name,
            SUM(i.qty) AS qty,
            SUM(i.line_paisa) AS revenue_paisa
     FROM sale_items i
     JOIN sales s ON s.id = i.sale_id
     WHERE s.${COMPLETED} AND s.created_at >= ? AND s.created_at < ?
     GROUP BY COALESCE(i.product_id, -i.id), i.name_snapshot
     ORDER BY ${order}
     LIMIT ?`,
    [range.from, range.to, limit],
  );

  return rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    qty: row.qty,
    revenuePaisa: row.revenue_paisa,
  }));
}

export interface SalesByDay {
  day: string;
  saleCount: number;
  grossPaisa: number;
}

/**
 * Takings per day, for the bar strip. Days are bucketed in Asia/Karachi by
 * shifting the stored UTC timestamp, so a sale at 2am local does not land on
 * the previous day.
 */
export async function salesByDay(range: DateRange): Promise<SalesByDay[]> {
  const rows = await db.query<{ day: string; n: number; gross: number }>(
    `SELECT date(created_at, ?) AS day,
            COUNT(*) AS n,
            COALESCE(SUM(total_paisa), 0) AS gross
     FROM sales
     WHERE ${COMPLETED} AND created_at >= ? AND created_at < ?
     GROUP BY day
     ORDER BY day`,
    [shopOffsetModifier(), range.from, range.to],
  );
  return rows.map((row) => ({
    day: row.day,
    saleCount: row.n,
    grossPaisa: row.gross,
  }));
}

/** Rows for the CSV export of whatever range is on screen. */
export async function salesRows(range: DateRange): Promise<Record<string, unknown>[]> {
  return db.query<Record<string, unknown>>(
    `SELECT s.invoice_no, s.created_at, c.name AS customer,
            s.subtotal_paisa, s.discount_paisa, s.total_paisa, s.paid_paisa,
            (s.total_paisa - s.paid_paisa) AS due_paisa,
            s.payment_method, s.status
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.created_at >= ? AND s.created_at < ?
     ORDER BY s.created_at`,
    [range.from, range.to],
  );
}
