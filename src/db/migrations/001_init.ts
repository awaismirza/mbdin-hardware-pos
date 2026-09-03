import type { Migration } from './types';

/**
 * Schema version 1 — the whole book.
 *
 * Two rules this schema encodes and the repositories must never break:
 *
 *  1. A customer's outstanding balance is derived, always:
 *       SELECT COALESCE(SUM(amount_paisa),0) FROM ledger_entries WHERE customer_id = ?
 *     There is deliberately no balance column. A denormalised balance drifts,
 *     and a drifted udhaar book is worse than no udhaar book.
 *
 *  2. Completing a sale is one transaction that writes the sales row, every
 *     sale_items row, one stock_movements row per line, and — if any part is
 *     unpaid — one ledger_entries charge. All or nothing.
 */
export const migration001: Migration = {
  version: 1,
  name: 'init',
  statements: [
    `CREATE TABLE meta (
       key   TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,

    `CREATE TABLE settings (
       key   TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,

    `CREATE TABLE categories (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       name_en    TEXT,
       name_ur    TEXT,
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL
     )`,

    // The CHECK below is the spec's, kept verbatim so a backup written by any
    // build of this app validates identically. It permits an empty string, so
    // repositories additionally reject blank names on the way in.
    `CREATE TABLE products (
       id                  INTEGER PRIMARY KEY AUTOINCREMENT,
       sku                 TEXT UNIQUE,
       barcode             TEXT UNIQUE,
       name_en             TEXT,
       name_ur             TEXT,
       category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
       unit                TEXT NOT NULL DEFAULT 'piece',
       cost_paisa          INTEGER NOT NULL DEFAULT 0,
       price_paisa         INTEGER NOT NULL,
       stock_qty           REAL    NOT NULL DEFAULT 0,
       low_stock_threshold REAL    NOT NULL DEFAULT 0,
       is_active           INTEGER NOT NULL DEFAULT 1,
       created_at          TEXT NOT NULL,
       updated_at          TEXT NOT NULL,
       CHECK (name_en IS NOT NULL OR name_ur IS NOT NULL)
     )`,
    `CREATE INDEX idx_products_name_en ON products(name_en)`,
    `CREATE INDEX idx_products_name_ur ON products(name_ur)`,
    `CREATE INDEX idx_products_active  ON products(is_active, name_en)`,

    `CREATE TABLE customers (
       id                 INTEGER PRIMARY KEY AUTOINCREMENT,
       name               TEXT NOT NULL,
       phone              TEXT,
       address            TEXT,
       notes              TEXT,
       credit_limit_paisa INTEGER NOT NULL DEFAULT 0,
       is_active          INTEGER NOT NULL DEFAULT 1,
       created_at         TEXT NOT NULL,
       updated_at         TEXT NOT NULL
     )`,
    `CREATE INDEX idx_customers_name  ON customers(name)`,
    `CREATE INDEX idx_customers_phone ON customers(phone)`,

    `CREATE TABLE sales (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       invoice_no      TEXT NOT NULL UNIQUE,
       customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
       subtotal_paisa  INTEGER NOT NULL,
       discount_paisa  INTEGER NOT NULL DEFAULT 0,
       total_paisa     INTEGER NOT NULL,
       paid_paisa      INTEGER NOT NULL DEFAULT 0,
       payment_method  TEXT NOT NULL DEFAULT 'cash',
       status          TEXT NOT NULL DEFAULT 'completed',
       note            TEXT,
       created_at      TEXT NOT NULL,
       voided_at       TEXT
     )`,
    `CREATE INDEX idx_sales_created  ON sales(created_at)`,
    `CREATE INDEX idx_sales_customer ON sales(customer_id, created_at)`,

    `CREATE TABLE sale_items (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
       product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
       name_snapshot TEXT NOT NULL,
       unit_snapshot TEXT NOT NULL,
       qty           REAL    NOT NULL,
       price_paisa   INTEGER NOT NULL,
       cost_paisa    INTEGER NOT NULL,
       line_paisa    INTEGER NOT NULL
     )`,
    `CREATE INDEX idx_sale_items_sale    ON sale_items(sale_id)`,
    `CREATE INDEX idx_sale_items_product ON sale_items(product_id)`,

    // The udhaar book. Positive = owed to the shop, negative = paid or forgiven.
    `CREATE TABLE ledger_entries (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
       sale_id      INTEGER REFERENCES sales(id) ON DELETE SET NULL,
       kind         TEXT NOT NULL,
       amount_paisa INTEGER NOT NULL,
       method       TEXT,
       note         TEXT,
       created_at   TEXT NOT NULL
     )`,
    `CREATE INDEX idx_ledger_customer ON ledger_entries(customer_id, created_at)`,

    `CREATE TABLE stock_movements (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       kind       TEXT NOT NULL,
       qty_delta  REAL NOT NULL,
       sale_id    INTEGER REFERENCES sales(id) ON DELETE SET NULL,
       note       TEXT,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX idx_stock_product ON stock_movements(product_id, created_at)`,

    // Survives a power cut or a tab kill: the cart lives in the database, not
    // in memory.
    `CREATE TABLE held_carts (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       label      TEXT,
       payload    TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
  ],
};
