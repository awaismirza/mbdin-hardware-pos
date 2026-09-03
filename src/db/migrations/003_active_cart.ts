import type { Migration } from './types';

/**
 * Schema version 3 — tell a parked cart apart from the live one.
 *
 * The spec's held_carts table is described as surviving a power cut or a tab
 * kill, and that is exactly what the cart in progress needs too: a shopkeeper
 * halfway through ringing up a basket when the power goes must find the basket
 * still there. So the live cart is written to this same table after every
 * change, and `kind` distinguishes it from the carts deliberately parked with
 * the Hold button.
 *
 * There is at most one row with kind = 'active'.
 */
export const migration003: Migration = {
  version: 3,
  name: 'active_cart',
  statements: [
    `ALTER TABLE held_carts ADD COLUMN kind TEXT NOT NULL DEFAULT 'held'`,
    `CREATE INDEX idx_held_carts_kind ON held_carts(kind)`,
  ],
};
