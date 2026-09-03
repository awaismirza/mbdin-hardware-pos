import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../client';
import { openTestDb, type TestDb } from '../testDb';
import { formatInvoiceNo } from '../../lib/invoice';
import type { CartLine } from '../../types/domain';
import { createCustomer, getBalance, getCustomer } from './customersRepo';
import { listLedger, takePayment } from './ledgerRepo';
import { createProduct, getProduct } from './productsRepo';
import {
  completeSale,
  CreditWithoutCustomerError,
  EmptyCartError,
  getSale,
  holdCart,
  listHeldCarts,
  listSales,
  loadActiveCart,
  resumeHeldCart,
  saveActiveCart,
  voidSale,
} from './salesRepo';
import { listMovements } from './stockRepo';

let handle: TestDb;

beforeEach(async () => {
  handle = await openTestDb();
});

afterEach(() => {
  handle.close();
});

async function sugar(qty = 100): Promise<number> {
  return createProduct({
    nameUr: 'چینی',
    nameEn: 'Sugar',
    unit: 'kg',
    costPaisa: 15800,
    pricePaisa: 17000,
    lowStockThreshold: 5,
    isActive: true,
    openingQty: qty,
  });
}

function line(productId: number | null, overrides: Partial<CartLine> = {}): CartLine {
  return {
    key: `k${String(Math.random())}`,
    productId,
    name: 'Sugar',
    unit: 'kg',
    qty: 1,
    pricePaisa: 17000,
    costPaisa: 15800,
    adHoc: productId === null,
    ...overrides,
  };
}

describe('completing a sale', () => {
  it('writes the sale, its items and its movements in one go', async () => {
    const productId = await sugar(100);
    const result = await completeSale({
      lines: [line(productId, { qty: 2 })],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 34000,
      paymentMethod: 'cash',
    });

    expect(result.totalPaisa).toBe(34000);
    expect(result.duePaisa).toBe(0);
    expect(result.invoiceNo).toBe(formatInvoiceNo('INV', 1));

    const sale = await getSale(result.saleId);
    expect(sale?.items).toHaveLength(1);
    expect(sale?.items[0]).toMatchObject({
      qty: 2,
      pricePaisa: 17000,
      costPaisa: 15800,
      linePaisa: 34000,
      nameSnapshot: 'Sugar',
    });

    expect((await getProduct(productId))?.stockQty).toBe(98);
    const movements = await listMovements(productId);
    expect(movements[0]).toMatchObject({ kind: 'sale', qtyDelta: -2, saleId: result.saleId });
  });

  it('advances the invoice number once per sale', async () => {
    const productId = await sugar();
    const first = await completeSale({
      lines: [line(productId)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 17000,
      paymentMethod: 'cash',
    });
    const second = await completeSale({
      lines: [line(productId)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 17000,
      paymentMethod: 'cash',
    });
    expect(first.invoiceNo).toBe('INV-000001');
    expect(second.invoiceNo).toBe('INV-000002');
  });

  it('snapshots the price so a later price change does not rewrite history', async () => {
    const productId = await sugar();
    const sale = await completeSale({
      lines: [line(productId, { pricePaisa: 16000 })],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 16000,
      paymentMethod: 'cash',
    });
    await db.exec('UPDATE products SET price_paisa = 99900 WHERE id = ?', [productId]);
    expect((await getSale(sale.saleId))?.items[0]?.pricePaisa).toBe(16000);
  });

  it('applies a discount to the total but not to the line', async () => {
    const productId = await sugar();
    const sale = await completeSale({
      lines: [line(productId, { qty: 3 })],
      customerId: null,
      discountPaisa: 1000,
      paidPaisa: 50000,
      paymentMethod: 'cash',
    });
    const stored = await getSale(sale.saleId);
    expect(stored?.subtotalPaisa).toBe(51000);
    expect(stored?.discountPaisa).toBe(1000);
    expect(stored?.totalPaisa).toBe(50000);
    expect(stored?.items[0]?.linePaisa).toBe(51000);
  });

  it('records a quick-sell line with no product and no stock movement', async () => {
    const sale = await completeSale({
      lines: [line(null, { name: 'Rope', pricePaisa: 25000, costPaisa: 0 })],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 25000,
      paymentMethod: 'cash',
    });
    const stored = await getSale(sale.saleId);
    expect(stored?.items[0]?.productId).toBeNull();
    const movements = await db.query('SELECT * FROM stock_movements');
    expect(movements).toHaveLength(0);
  });

  it('refuses an empty cart', async () => {
    await expect(
      completeSale({
        lines: [],
        customerId: null,
        discountPaisa: 0,
        paidPaisa: 0,
        paymentMethod: 'cash',
      }),
    ).rejects.toBeInstanceOf(EmptyCartError);
  });

  it('refuses credit with nobody to charge it to', async () => {
    const productId = await sugar();
    await expect(
      completeSale({
        lines: [line(productId)],
        customerId: null,
        discountPaisa: 0,
        paidPaisa: 0,
        paymentMethod: 'credit',
      }),
    ).rejects.toBeInstanceOf(CreditWithoutCustomerError);
  });

  it('leaves nothing behind when the transaction fails', async () => {
    const productId = await sugar();
    // A line pointing at a product that does not exist violates the foreign key.
    await expect(
      completeSale({
        lines: [line(productId), line(999_999)],
        customerId: null,
        discountPaisa: 0,
        paidPaisa: 34000,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow();

    expect(await db.query('SELECT * FROM sales')).toHaveLength(0);
    expect(await db.query('SELECT * FROM sale_items')).toHaveLength(0);
    // Only the opening movement from creating the product survives.
    expect(await listMovements(productId)).toHaveLength(1);
    expect((await getProduct(productId))?.stockQty).toBe(100);
    // And the invoice counter did not move.
    const next = await db.queryOne<{ value: string }>(
      "SELECT value FROM settings WHERE key='next_invoice_no'",
    );
    expect(next?.value).toBe('1');
  });
});

describe('udhaar', () => {
  it('charges the unpaid part to the customer ledger', async () => {
    const productId = await sugar();
    const customerId = await createCustomer({ name: 'Akram', phone: '03001234567' });

    const sale = await completeSale({
      lines: [line(productId, { qty: 2 })],
      customerId,
      discountPaisa: 0,
      paidPaisa: 0,
      paymentMethod: 'credit',
    });

    expect(sale.duePaisa).toBe(34000);
    expect(await getBalance(customerId)).toBe(34000);
    const ledger = await listLedger(customerId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: 'charge', amountPaisa: 34000, runningPaisa: 34000 });
  });

  it('charges only the remainder on a part payment', async () => {
    const productId = await sugar();
    const customerId = await createCustomer({ name: 'Akram' });

    await completeSale({
      lines: [line(productId, { qty: 2 })],
      customerId,
      discountPaisa: 0,
      paidPaisa: 20000,
      paymentMethod: 'mixed',
    });

    expect(await getBalance(customerId)).toBe(14000);
  });

  it('keeps the balance equal to the sum of ledger entries through payments', async () => {
    const productId = await sugar();
    const customerId = await createCustomer({ name: 'Akram' });

    await completeSale({
      lines: [line(productId, { qty: 3 })],
      customerId,
      discountPaisa: 0,
      paidPaisa: 0,
      paymentMethod: 'credit',
    });
    await takePayment({ customerId, amountPaisa: 20000, method: 'cash' });
    await takePayment({ customerId, amountPaisa: 5000, method: 'easypaisa' });

    const ledger = await listLedger(customerId);
    const summed = ledger.reduce((total, entry) => total + entry.amountPaisa, 0);
    expect(await getBalance(customerId)).toBe(summed);
    expect(summed).toBe(51000 - 25000);
    expect(ledger[ledger.length - 1]?.runningPaisa).toBe(summed);
    expect((await getCustomer(customerId))?.balancePaisa).toBe(summed);
  });
});

describe('voiding', () => {
  it('puts stock back and reverses the udhaar charge without deleting anything', async () => {
    const productId = await sugar(100);
    const customerId = await createCustomer({ name: 'Akram' });

    const sale = await completeSale({
      lines: [line(productId, { qty: 4 })],
      customerId,
      discountPaisa: 0,
      paidPaisa: 0,
      paymentMethod: 'credit',
    });
    expect(await getBalance(customerId)).toBe(68000);
    expect((await getProduct(productId))?.stockQty).toBe(96);

    await voidSale(sale.saleId);

    const voided = await getSale(sale.saleId);
    expect(voided?.status).toBe('void');
    expect(voided?.voidedAt).toBeTruthy();
    expect(voided?.items).toHaveLength(1); // nothing deleted
    expect((await getProduct(productId))?.stockQty).toBe(100);
    expect(await getBalance(customerId)).toBe(0);

    const ledger = await listLedger(customerId);
    expect(ledger.map((entry) => entry.kind)).toEqual(['charge', 'adjustment']);
  });

  it('leaves a payment already made standing', async () => {
    const productId = await sugar();
    const customerId = await createCustomer({ name: 'Akram' });

    const sale = await completeSale({
      lines: [line(productId, { qty: 4 })],
      customerId,
      discountPaisa: 0,
      paidPaisa: 0,
      paymentMethod: 'credit',
    });
    await takePayment({ customerId, amountPaisa: 20000, method: 'cash' });
    await voidSale(sale.saleId);

    // The 680 charge is reversed; the 200 they handed over is now credit.
    expect(await getBalance(customerId)).toBe(-20000);
  });

  it('is safe to run twice', async () => {
    const productId = await sugar(100);
    const sale = await completeSale({
      lines: [line(productId, { qty: 2 })],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 34000,
      paymentMethod: 'cash',
    });
    await voidSale(sale.saleId);
    await voidSale(sale.saleId);
    expect((await getProduct(productId))?.stockQty).toBe(100);
  });
});

describe('carts that survive a power cut', () => {
  it('stores the live cart and reads it back', async () => {
    const productId = await sugar();
    const snapshot = {
      lines: [line(productId, { qty: 2.5 })],
      customerId: null,
      discountPaisa: 500,
    };
    await saveActiveCart(snapshot);

    const restored = await loadActiveCart();
    expect(restored?.lines).toHaveLength(1);
    expect(restored?.lines[0]?.qty).toBe(2.5);
    expect(restored?.discountPaisa).toBe(500);
  });

  it('keeps only one live cart', async () => {
    const productId = await sugar();
    await saveActiveCart({ lines: [line(productId)], customerId: null, discountPaisa: 0 });
    await saveActiveCart({
      lines: [line(productId), line(productId)],
      customerId: null,
      discountPaisa: 0,
    });
    const rows = await db.query(`SELECT * FROM held_carts WHERE kind = 'active'`);
    expect(rows).toHaveLength(1);
    expect((await loadActiveCart())?.lines).toHaveLength(2);
  });

  it('clears the live cart when it empties', async () => {
    const productId = await sugar();
    await saveActiveCart({ lines: [line(productId)], customerId: null, discountPaisa: 0 });
    await saveActiveCart({ lines: [], customerId: null, discountPaisa: 0 });
    expect(await loadActiveCart()).toBeNull();
  });

  it('clears the live cart when the sale completes', async () => {
    const productId = await sugar();
    await saveActiveCart({ lines: [line(productId)], customerId: null, discountPaisa: 0 });
    await completeSale({
      lines: [line(productId)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 17000,
      paymentMethod: 'cash',
    });
    expect(await loadActiveCart()).toBeNull();
  });

  it('holds a cart without it showing up as the live one', async () => {
    const productId = await sugar();
    await saveActiveCart({ lines: [line(productId)], customerId: null, discountPaisa: 0 });
    await holdCart({ lines: [line(productId)], customerId: null, discountPaisa: 0 }, 'Blue shirt');

    expect(await loadActiveCart()).toBeNull();
    const held = await listHeldCarts();
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ label: 'Blue shirt', lineCount: 1, totalPaisa: 17000 });

    const resumed = await resumeHeldCart(held[0]!.id);
    expect(resumed?.lines).toHaveLength(1);
    expect(await listHeldCarts()).toHaveLength(0);
  });

  it('ignores an unreadable saved cart rather than failing to open', async () => {
    await db.exec(
      `INSERT INTO held_carts (label, payload, kind, created_at, updated_at)
       VALUES (NULL, 'not json', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    );
    expect(await loadActiveCart()).toBeNull();
  });
});

describe('listing sales', () => {
  it('returns sales inside the range only', async () => {
    const productId = await sugar();
    const sale = await completeSale({
      lines: [line(productId)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 17000,
      paymentMethod: 'cash',
    });
    await db.exec('UPDATE sales SET created_at = ? WHERE id = ?', [
      '2026-03-01T05:00:00.000Z',
      sale.saleId,
    ]);

    expect(
      await listSales('2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z'),
    ).toHaveLength(1);
    expect(
      await listSales('2026-03-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z'),
    ).toHaveLength(0);
  });
});
