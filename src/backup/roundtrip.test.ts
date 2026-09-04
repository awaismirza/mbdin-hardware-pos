import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../db/client';
import { openTestDb, type TestDb } from '../db/testDb';
import {
  createProduct,
  getProductPhoto,
  setProductPhoto,
} from '../db/repos/productsRepo';
import {
  createCustomer,
  getCustomer,
  getCustomerPhoto,
  setCustomerPhoto,
} from '../db/repos/customersRepo';
import { LATEST_SCHEMA_VERSION } from '../db/migrations';
import { completeSale } from '../db/repos/salesRepo';
import { BACKUP_TABLES, buildJsonBackup } from './exporters';

let handle: TestDb;

beforeEach(async () => {
  handle = await openTestDb();
});

afterEach(() => {
  handle.close();
});

/** A tiny but distinctive JPEG-ish blob so a byte-for-byte compare is meaningful. */
function fakeJpeg(seed: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  for (let i = 3; i < bytes.length; i += 1) bytes[i] = (seed * 37 + i * 13) % 256;
  return bytes;
}

async function seedShop(): Promise<{ productId: number; customerId: number }> {
  const productId = await createProduct({
    nameEn: 'Sugar',
    nameUr: 'چینی',
    unit: 'kg',
    costPaisa: 15_800,
    pricePaisa: 17_000,
    lowStockThreshold: 5,
    isActive: true,
    openingQty: 50,
  });
  await setProductPhoto(productId, {
    mime: 'image/jpeg',
    width: 640,
    height: 480,
    bytes: fakeJpeg(1),
  });

  const customerId = await createCustomer({ name: 'Akram', phone: '03001234567' });
  await setCustomerPhoto(customerId, {
    mime: 'image/jpeg',
    width: 320,
    height: 320,
    bytes: fakeJpeg(2),
  });

  await completeSale({
    lines: [
      {
        key: 'l1',
        productId,
        name: 'Sugar',
        unit: 'kg',
        qty: 2,
        pricePaisa: 17_000,
        costPaisa: 15_800,
        adHoc: false,
      },
    ],
    customerId: null,
    discountPaisa: 0,
    paidPaisa: 34_000,
    paymentMethod: 'cash',
    note: null,
  });

  return { productId, customerId };
}

async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const row = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    out[table] = row?.n ?? 0;
  }
  return out;
}

describe('JSON backup round-trip', () => {
  it('restores every table, and product and customer photos byte-for-byte', async () => {
    const { productId, customerId } = await seedShop();

    const before = await tableCounts();
    expect(before['products']).toBe(1);
    expect(before['product_images']).toBe(1);
    expect(before['customer_images']).toBe(1);
    expect(before['sales']).toBe(1);
    expect(before['sale_items']).toBe(1);
    expect(before['stock_movements']).toBeGreaterThan(0);

    const backup = await buildJsonBackup();

    // The backup must actually carry the image bytes, not a placeholder.
    const imageRow = backup.tables['product_images']?.[0] as { bytes: unknown };
    expect(imageRow.bytes).toHaveProperty('$b64');
    expect(typeof (imageRow.bytes as { $b64: string }).$b64).toBe('string');
    expect((imageRow.bytes as { $b64: string }).$b64.length).toBeGreaterThan(10);

    // Simulate a fresh device: wipe every table, then restore.
    for (const table of [...BACKUP_TABLES].reverse()) {
      await db.exec(`DELETE FROM ${table}`);
    }
    expect((await tableCounts())['products']).toBe(0);

    await db.restoreJson(backup);

    const after = await tableCounts();
    for (const table of BACKUP_TABLES) {
      expect(after[table], `row count for ${table}`).toBe(before[table]);
    }

    // The product came back whole.
    expect((await getCustomer(customerId))?.name).toBe('Akram');

    // The photos came back byte-for-byte.
    const productPhoto = await getProductPhoto(productId);
    expect(productPhoto).not.toBeNull();
    expect(productPhoto!.mime).toBe('image/jpeg');
    expect(productPhoto!.width).toBe(640);
    expect(Array.from(productPhoto!.bytes)).toEqual(Array.from(fakeJpeg(1)));

    const customerPhoto = await getCustomerPhoto(customerId);
    expect(customerPhoto).not.toBeNull();
    expect(Array.from(customerPhoto!.bytes)).toEqual(Array.from(fakeJpeg(2)));
  });

  it('replaces the target ledger completely — restore is not a merge', async () => {
    await seedShop();
    const backup = await buildJsonBackup();

    // A different shop on the target device: two other products, one other
    // customer, no photos.
    for (const table of [...BACKUP_TABLES].reverse()) await db.exec(`DELETE FROM ${table}`);
    await createProduct({ nameEn: 'Rice', unit: 'kg', costPaisa: 0, pricePaisa: 9000, lowStockThreshold: 0, isActive: true });
    await createProduct({ nameEn: 'Ghee', unit: 'kg', costPaisa: 0, pricePaisa: 22000, lowStockThreshold: 0, isActive: true });
    await createCustomer({ name: 'Someone else' });

    await db.restoreJson(backup);

    const products = await db.query<{ name_en: string }>('SELECT name_en FROM products');
    expect(products.map((p) => p.name_en)).toEqual(['Sugar']);
    const customers = await db.query<{ name: string }>('SELECT name FROM customers');
    expect(customers.map((c) => c.name)).toEqual(['Akram']);
    expect((await tableCounts())['product_images']).toBe(1);
  });

  it('restores a backup written by an older schema that had no customer photos', async () => {
    const { customerId } = await seedShop();
    const backup = await buildJsonBackup();

    // Pretend this file predates migration 004: it has no customer_images key
    // and its header says schema 3.
    backup.schemaVersion = 3;
    delete backup.tables['customer_images'];

    for (const table of [...BACKUP_TABLES].reverse()) await db.exec(`DELETE FROM ${table}`);
    await db.restoreJson(backup);

    expect((await tableCounts())['products']).toBe(1);
    expect((await tableCounts())['product_images']).toBe(1);
    expect((await tableCounts())['customer_images']).toBe(0);
    expect(await getCustomerPhoto(customerId)).toBeNull();

    // The schema version is corrected to the current one.
    const version = await db.queryOne<{ value: string }>(
      `SELECT value FROM meta WHERE key = 'schema_version'`,
    );
    expect(Number(version?.value)).toBe(LATEST_SCHEMA_VERSION);
  });
});
