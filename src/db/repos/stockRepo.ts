import { nowIso } from '../../lib/dates';
import { roundQty } from '../../lib/money';
import type { StockMovement, StockMovementKind } from '../../types/domain';
import type { TxStep } from '../api';
import { db } from '../client';
import { toStockMovement, type StockMovementRow } from './rows';

/**
 * Stock lives in two places that must never disagree: `products.stock_qty` is
 * the running figure the screens read, and `stock_movements` is the history
 * that explains it. Every change goes through here so the two move together,
 * inside one transaction.
 *
 * Selling below zero is allowed on purpose. The shop may well have stock the
 * book has lost track of, and an app that refuses to sell what is physically on
 * the shelf is an app that gets abandoned. The count goes negative and the UI
 * says so quietly.
 */

export interface MovementInput {
  productId: number;
  kind: StockMovementKind;
  /** Signed. Negative for a sale, positive for a delivery. */
  qtyDelta: number;
  saleId?: number | null;
  note?: string | null;
}

/** The transaction steps for one movement, for callers composing a larger one. */
export function movementSteps(input: MovementInput, at: string = nowIso()): TxStep[] {
  const delta = roundQty(input.qtyDelta);
  return [
    {
      sql: `INSERT INTO stock_movements (product_id, kind, qty_delta, sale_id, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [input.productId, input.kind, delta, input.saleId ?? null, input.note ?? null, at],
    },
    {
      sql: `UPDATE products
            SET stock_qty = ROUND(stock_qty + ?, 3), updated_at = ?
            WHERE id = ?`,
      params: [delta, at, input.productId],
    },
  ];
}

export async function applyMovement(input: MovementInput): Promise<void> {
  await db.transaction(movementSteps(input));
}

/**
 * Receiving a delivery. An optional new cost replaces the product's cost, which
 * is what the margin figure and every future sale's cost snapshot will use.
 */
export async function receiveStock(
  productId: number,
  qty: number,
  costPaisa: number | null,
  note?: string,
): Promise<void> {
  const at = nowIso();
  const steps = movementSteps(
    { productId, kind: 'purchase', qtyDelta: Math.abs(roundQty(qty)), note: note ?? null },
    at,
  );
  if (costPaisa !== null) {
    steps.push({
      sql: 'UPDATE products SET cost_paisa = ?, updated_at = ? WHERE id = ?',
      params: [costPaisa, at, productId],
    });
  }
  await db.transaction(steps);
}

/**
 * A stock take. The counted figure becomes the truth and the difference is
 * written as an adjustment, so the history explains the correction rather than
 * the number silently changing.
 */
export async function stockTake(
  productId: number,
  countedQty: number,
  reason: string,
): Promise<number> {
  const row = await db.queryOne<{ stock_qty: number }>(
    'SELECT stock_qty FROM products WHERE id = ?',
    [productId],
  );
  if (!row) throw new Error(`No product ${productId}`);

  const delta = roundQty(countedQty - row.stock_qty);
  if (delta === 0) return 0;
  await applyMovement({ productId, kind: 'adjustment', qtyDelta: delta, note: reason });
  return delta;
}

export async function listMovements(productId: number, limit = 100): Promise<StockMovement[]> {
  const rows = await db.query<StockMovementRow>(
    `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [productId, limit],
  );
  return rows.map(toStockMovement);
}

export interface LowStockRow {
  id: number;
  nameUr: string | null;
  nameEn: string | null;
  unit: string;
  stockQty: number;
  lowStockThreshold: number;
}

export async function listLowStock(limit = 50): Promise<LowStockRow[]> {
  const rows = await db.query<{
    id: number;
    name_ur: string | null;
    name_en: string | null;
    unit: string;
    stock_qty: number;
    low_stock_threshold: number;
  }>(
    `SELECT id, name_ur, name_en, unit, stock_qty, low_stock_threshold
     FROM products
     WHERE is_active = 1
       AND ((low_stock_threshold > 0 AND stock_qty <= low_stock_threshold) OR stock_qty <= 0)
     ORDER BY (stock_qty <= 0) DESC, stock_qty ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    nameUr: row.name_ur,
    nameEn: row.name_en,
    unit: row.unit,
    stockQty: row.stock_qty,
    lowStockThreshold: row.low_stock_threshold,
  }));
}
