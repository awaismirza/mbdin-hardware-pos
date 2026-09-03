import type { Migration } from './types';

/**
 * Schema version 4 — one optional photo per customer.
 *
 * Customer portraits follow the same rule as product photos: the image belongs
 * in the SQLite file so every backup and restore carries the whole shop book.
 */
export const migration004: Migration = {
  version: 4,
  name: 'customer_images',
  statements: [
    `CREATE TABLE customer_images (
       customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
       mime        TEXT NOT NULL DEFAULT 'image/jpeg',
       width       INTEGER NOT NULL,
       height      INTEGER NOT NULL,
       bytes       BLOB NOT NULL,
       created_at  TEXT NOT NULL
     )`,
  ],
};
