import type { Migration } from './types';

/**
 * Schema version 2 — a photo per product, taken on the device camera.
 *
 * The bytes live in the database rather than as loose OPFS files, and that is
 * the whole point: a .sqlite3 backup is one file, and if photos sat outside it
 * the shopkeeper would restore a backup and silently lose every picture. One
 * file in, one file out.
 *
 * Separate table, not a column on products, so that the catalogue query that
 * has to answer in under 100 ms at 2,000 rows never drags image blobs across
 * the worker boundary. Callers ask for an image explicitly, by product id.
 *
 * Images are downscaled to a longest edge of 640px and encoded as JPEG before
 * they arrive here — roughly 40–60 KB each. See features/stock/photo.ts.
 */
export const migration002: Migration = {
  version: 2,
  name: 'product_images',
  statements: [
    `CREATE TABLE product_images (
       product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
       mime       TEXT NOT NULL DEFAULT 'image/jpeg',
       width      INTEGER NOT NULL,
       height     INTEGER NOT NULL,
       bytes      BLOB NOT NULL,
       created_at TEXT NOT NULL
     )`,
  ],
};
