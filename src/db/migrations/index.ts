import { migration001 } from './001_init';
import { migration002 } from './002_product_images';
import { migration003 } from './003_active_cart';
import { migration004 } from './004_customer_images';
import type { Migration } from './types';

export type { Migration };

/**
 * Every migration ever written, in order. Never edit a shipped migration —
 * a shopkeeper's file on disk was built by the old one. Add a new number.
 */
export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** Default settings rows. Missing keys are back-filled on every boot, so
 *  adding one here needs no migration. */
export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = {
  shop_name: '',
  shop_phone: '',
  shop_address: '',
  language: 'en',
  receipt_footer: '',
  last_backup_at: '',
  last_archive_at: '',
  low_stock_default: '5',
  invoice_prefix: 'INV',
  next_invoice_no: '1',
  pin_hash: '',
  persist_banner_dismissed: '0',
};
