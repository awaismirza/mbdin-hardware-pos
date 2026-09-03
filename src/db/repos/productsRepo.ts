import { nowIso } from '../../lib/dates';
import { roundQty } from '../../lib/money';
import type { Category, Product, ProductDraft } from '../../types/domain';
import type { TxStep } from '../api';
import { db, lastIdOf } from '../client';
import { toCategory, toProduct, type CategoryRow, type ProductRow } from './rows';

export type StockFilter = 'all' | 'low' | 'out' | 'inactive';

export interface ProductQuery {
  search?: string;
  categoryId?: number | null;
  filter?: StockFilter;
  limit?: number;
}

/**
 * The one SELECT list every product read uses. `has_photo` is a cheap EXISTS so
 * that a tile can show a placeholder without ever pulling image bytes across
 * the worker boundary.
 */
const SELECT_PRODUCT = `
  SELECT p.*, EXISTS(SELECT 1 FROM product_images i WHERE i.product_id = p.id) AS has_photo
  FROM products p`;

/**
 * Search matches Urdu name, English name, SKU and barcode.
 *
 * A leading-wildcard LIKE cannot use an index, so this is a scan — but it is a
 * scan of four short columns over a few thousand rows inside WASM, which lands
 * well inside the 100 ms budget. Ordering puts prefix matches first, because a
 * shopkeeper typing "sug" means Sugar, not "Brown Sugar Refill".
 */
export async function listProducts(query: ProductQuery = {}): Promise<Product[]> {
  const { search = '', categoryId = null, filter = 'all', limit = 500 } = query;
  const term = search.trim();

  // Numbered binds, because the search term appears eight times across the
  // WHERE and the ORDER BY and positional `?` would be unreadable.
  //   ?1 the term exactly   ?2 %term%   ?3 term%   ?4 limit   ?5 category
  const where = [statusClause(filter)];
  if (term) {
    where.push('(p.name_ur LIKE ?2 OR p.name_en LIKE ?2 OR p.sku LIKE ?2 OR p.barcode LIKE ?2)');
  }
  if (categoryId !== null) {
    where.push('p.category_id = ?5');
  }

  const rank = term
    ? `CASE WHEN p.barcode = ?1 OR p.sku = ?1 THEN 0
            WHEN p.name_ur LIKE ?3 OR p.name_en LIKE ?3 THEN 1
            ELSE 2 END,`
    : '';

  const params: (string | number)[] = [term, `%${term}%`, `${term}%`, limit];
  if (categoryId !== null) params.push(categoryId);

  const rows = await db.query<ProductRow>(
    `${SELECT_PRODUCT}
     WHERE ${where.join(' AND ')}
     ORDER BY ${rank} ${NAME_ORDER}
     LIMIT ?4`,
    params,
  );
  return rows.map(toProduct);
}

/** Sort by whichever name the product actually has. */
const NAME_ORDER = `COALESCE(NULLIF(TRIM(p.name_ur), ''), p.name_en) COLLATE NOCASE`;

function statusClause(filter: StockFilter): string {
  switch (filter) {
    case 'inactive':
      return 'p.is_active = 0';
    case 'low':
      // Only products with a threshold set can be "low"; zero means unwatched.
      return `p.is_active = 1 AND p.low_stock_threshold > 0
              AND p.stock_qty <= p.low_stock_threshold AND p.stock_qty > 0`;
    case 'out':
      return 'p.is_active = 1 AND p.stock_qty <= 0';
    default:
      return 'p.is_active = 1';
  }
}

export async function getProduct(id: number): Promise<Product | null> {
  const row = await db.queryOne<ProductRow>(`${SELECT_PRODUCT} WHERE p.id = ?`, [id]);
  return row ? toProduct(row) : null;
}

export async function findByBarcode(barcode: string): Promise<Product | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;
  const row = await db.queryOne<ProductRow>(`${SELECT_PRODUCT} WHERE p.barcode = ?`, [trimmed]);
  return row ? toProduct(row) : null;
}

export async function countProducts(): Promise<number> {
  const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products');
  return row?.n ?? 0;
}

export class DuplicateFieldError extends Error {
  constructor(readonly field: 'barcode' | 'sku') {
    super(`${field} already in use`);
  }
}

/**
 * Creates a product. An opening quantity is written as an `opening` stock
 * movement in the same transaction, never as a bare column update — every
 * quantity change in this app leaves a movement row behind it.
 */
export async function createProduct(draft: ProductDraft): Promise<number> {
  await assertUnique(draft);
  const now = nowIso();
  const openingQty = roundQty(draft.openingQty ?? 0);

  const steps: TxStep[] = [
    {
      sql: `INSERT INTO products
              (sku, barcode, name_en, name_ur, category_id, unit, cost_paisa, price_paisa,
               stock_qty, low_stock_threshold, is_active, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        blankToNull(draft.sku),
        blankToNull(draft.barcode),
        blankToNull(draft.nameEn),
        blankToNull(draft.nameUr),
        draft.categoryId ?? null,
        draft.unit,
        draft.costPaisa,
        draft.pricePaisa,
        openingQty,
        draft.lowStockThreshold,
        draft.isActive ? 1 : 0,
        now,
        now,
      ],
    },
  ];

  if (openingQty !== 0) {
    steps.push({
      sql: `INSERT INTO stock_movements (product_id, kind, qty_delta, sale_id, note, created_at)
            VALUES (?, 'opening', ?, NULL, NULL, ?)`,
      params: [lastIdOf(0), openingQty, now],
    });
  }

  const results = await db.transaction(steps);
  return results[0]!.lastId;
}

export async function updateProduct(draft: ProductDraft & { id: number }): Promise<void> {
  await assertUnique(draft);
  await db.exec(
    `UPDATE products SET
       sku = ?, barcode = ?, name_en = ?, name_ur = ?, category_id = ?, unit = ?,
       cost_paisa = ?, price_paisa = ?, low_stock_threshold = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
      blankToNull(draft.sku),
      blankToNull(draft.barcode),
      blankToNull(draft.nameEn),
      blankToNull(draft.nameUr),
      draft.categoryId ?? null,
      draft.unit,
      draft.costPaisa,
      draft.pricePaisa,
      draft.lowStockThreshold,
      draft.isActive ? 1 : 0,
      nowIso(),
      draft.id,
    ],
  );
}

export async function setProductActive(id: number, active: boolean): Promise<void> {
  await db.exec('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?', [
    active ? 1 : 0,
    nowIso(),
    id,
  ]);
}

/** Updates only the cost, used when receiving stock at a new price. */
export async function setProductCost(id: number, costPaisa: number): Promise<void> {
  await db.exec('UPDATE products SET cost_paisa = ?, updated_at = ? WHERE id = ?', [
    costPaisa,
    nowIso(),
    id,
  ]);
}

async function assertUnique(draft: ProductDraft): Promise<void> {
  const id = draft.id ?? -1;
  const barcode = blankToNull(draft.barcode);
  const sku = blankToNull(draft.sku);

  if (barcode) {
    const clash = await db.queryOne<{ id: number }>(
      'SELECT id FROM products WHERE barcode = ? AND id <> ?',
      [barcode, id],
    );
    if (clash) throw new DuplicateFieldError('barcode');
  }
  if (sku) {
    const clash = await db.queryOne<{ id: number }>(
      'SELECT id FROM products WHERE sku = ? AND id <> ?',
      [sku, id],
    );
    if (clash) throw new DuplicateFieldError('sku');
  }
}

/** An empty string in a UNIQUE column would collide on the second blank row. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ---- Categories ------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const rows = await db.query<CategoryRow>(
    `SELECT * FROM categories ORDER BY sort_order, COALESCE(NULLIF(name_ur, ''), name_en) COLLATE NOCASE`,
  );
  return rows.map(toCategory);
}

export async function createCategory(nameUr: string, nameEn: string): Promise<number> {
  const result = await db.exec(
    `INSERT INTO categories (name_en, name_ur, sort_order, created_at)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
    [blankToNull(nameEn), blankToNull(nameUr), nowIso()],
  );
  return result.lastId;
}

/** Finds a category by either name, creating it if it is new. Used by CSV import. */
export async function findOrCreateCategory(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await db.queryOne<{ id: number }>(
    'SELECT id FROM categories WHERE name_en = ? OR name_ur = ? LIMIT 1',
    [trimmed, trimmed],
  );
  if (existing) return existing.id;
  return createCategory(trimmed, trimmed);
}

// ---- Photos ----------------------------------------------------------------

export interface StoredPhoto {
  mime: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export async function getProductPhoto(productId: number): Promise<StoredPhoto | null> {
  const row = await db.queryOne<{
    mime: string;
    width: number;
    height: number;
    bytes: Uint8Array;
  }>('SELECT mime, width, height, bytes FROM product_images WHERE product_id = ?', [productId]);
  return row ?? null;
}

export async function setProductPhoto(productId: number, photo: StoredPhoto): Promise<void> {
  await db.exec(
    `INSERT INTO product_images (product_id, mime, width, height, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       mime = excluded.mime, width = excluded.width, height = excluded.height,
       bytes = excluded.bytes, created_at = excluded.created_at`,
    [productId, photo.mime, photo.width, photo.height, photo.bytes, nowIso()],
  );
}

export async function deleteProductPhoto(productId: number): Promise<void> {
  await db.exec('DELETE FROM product_images WHERE product_id = ?', [productId]);
}
