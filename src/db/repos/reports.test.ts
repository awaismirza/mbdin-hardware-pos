import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../client';
import { openTestDb, type TestDb } from '../testDb';
import { resolveRange } from '../../lib/dates';
import type { CartLine } from '../../types/domain';
import { createCustomer } from './customersRepo';
import { takePayment } from './ledgerRepo';
import { createProduct } from './productsRepo';
import { salesByDay, summary, topProducts } from './reportsRepo';
import { completeSale, voidSale } from './salesRepo';

let handle: TestDb;

beforeEach(async () => {
  handle = await openTestDb();
});

afterEach(() => {
  handle.close();
});

async function product(name: string, price: number, cost: number): Promise<number> {
  return createProduct({
    nameEn: name,
    unit: 'kg',
    costPaisa: cost,
    pricePaisa: price,
    lowStockThreshold: 0,
    isActive: true,
    openingQty: 1000,
  });
}

function line(productId: number, price: number, cost: number, qty = 1): CartLine {
  return {
    key: `k${String(Math.random())}`,
    productId,
    name: 'item',
    unit: 'kg',
    qty,
    pricePaisa: price,
    costPaisa: cost,
    adHoc: false,
  };
}

const today = resolveRange('today');

describe('the day summary reconciles against the raw rows', () => {
  it('matches SUM(total_paisa) over completed sales', async () => {
    const sugar = await product('Sugar', 17000, 15800);
    const ghee = await product('Ghee', 72000, 66800);

    await completeSale({
      lines: [line(sugar, 17000, 15800, 2)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 34000,
      paymentMethod: 'cash',
    });
    await completeSale({
      lines: [line(ghee, 72000, 66800)],
      customerId: null,
      discountPaisa: 2000,
      paidPaisa: 70000,
      paymentMethod: 'cash',
    });

    const figures = await summary(today);
    const raw = await db.queryOne<{ n: number; gross: number; paid: number }>(
      `SELECT COUNT(*) AS n, SUM(total_paisa) AS gross, SUM(paid_paisa) AS paid
       FROM sales WHERE status = 'completed'`,
    );

    expect(figures.saleCount).toBe(raw?.n);
    expect(figures.grossPaisa).toBe(raw?.gross);
    expect(figures.cashPaisa).toBe(raw?.paid);
    expect(figures.grossPaisa).toBe(34000 + 70000);
    expect(figures.discountPaisa).toBe(2000);
  });

  it('leaves a voided sale out of every figure but the void count', async () => {
    const sugar = await product('Sugar', 17000, 15800);

    const kept = await completeSale({
      lines: [line(sugar, 17000, 15800, 2)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 34000,
      paymentMethod: 'cash',
    });
    const scrapped = await completeSale({
      lines: [line(sugar, 17000, 15800, 5)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 85000,
      paymentMethod: 'cash',
    });

    let figures = await summary(today);
    expect(figures.grossPaisa).toBe(34000 + 85000);

    await voidSale(scrapped.saleId);

    figures = await summary(today);
    expect(figures.saleCount).toBe(1);
    expect(figures.grossPaisa).toBe(34000);
    expect(figures.cashPaisa).toBe(34000);
    expect(figures.voidedCount).toBe(1);

    // And the top-product list forgets it too.
    const top = await topProducts(today, 'qty');
    expect(top[0]?.qty).toBe(2);

    void kept;
  });

  it('splits a part-paid credit sale into cash taken and udhaar given', async () => {
    const sugar = await product('Sugar', 17000, 15800);
    const customerId = await createCustomer({ name: 'Akram' });

    await completeSale({
      lines: [line(sugar, 17000, 15800, 4)],
      customerId,
      discountPaisa: 0,
      paidPaisa: 30000,
      paymentMethod: 'mixed',
    });

    const figures = await summary(today);
    expect(figures.grossPaisa).toBe(68000);
    expect(figures.cashPaisa).toBe(30000);
    expect(figures.creditGivenPaisa).toBe(38000);
    // Cash plus udhaar must always account for the whole of the takings.
    expect(figures.cashPaisa + figures.creditGivenPaisa).toBe(figures.grossPaisa);
  });

  it('counts udhaar coming back in separately from the day takings', async () => {
    const customerId = await createCustomer({ name: 'Akram' });
    const sugar = await product('Sugar', 17000, 15800);

    await completeSale({
      lines: [line(sugar, 17000, 15800, 2)],
      customerId,
      discountPaisa: 0,
      paidPaisa: 0,
      paymentMethod: 'credit',
    });
    await takePayment({ customerId, amountPaisa: 20000, method: 'cash' });

    const figures = await summary(today);
    // A payment on an old debt is not a new sale, so it must not inflate gross.
    expect(figures.grossPaisa).toBe(34000);
    expect(figures.paymentsReceivedPaisa).toBe(20000);
  });

  it('computes profit from the cost snapshot, not from the price today', async () => {
    const sugar = await product('Sugar', 17000, 15800);

    await completeSale({
      lines: [line(sugar, 17000, 15800, 3)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 51000,
      paymentMethod: 'cash',
    });

    // The supplier puts the price up after the sale.
    await db.exec('UPDATE products SET cost_paisa = 90000 WHERE id = ?', [sugar]);

    const figures = await summary(today);
    expect(figures.profitPaisa).toBe((17000 - 15800) * 3);
  });

  it('takes the discount off the profit', async () => {
    const sugar = await product('Sugar', 17000, 15800);
    await completeSale({
      lines: [line(sugar, 17000, 15800, 3)],
      customerId: null,
      discountPaisa: 1000,
      paidPaisa: 50000,
      paymentMethod: 'cash',
    });

    const figures = await summary(today);
    expect(figures.profitPaisa).toBe((17000 - 15800) * 3 - 1000);
  });

  it('is all zeroes on a day with nothing in it', async () => {
    const figures = await summary(resolveRange('yesterday'));
    expect(figures).toMatchObject({
      saleCount: 0,
      grossPaisa: 0,
      cashPaisa: 0,
      creditGivenPaisa: 0,
      profitPaisa: 0,
    });
  });

  it('only counts sales inside the range', async () => {
    const sugar = await product('Sugar', 17000, 15800);
    const sale = await completeSale({
      lines: [line(sugar, 17000, 15800)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 17000,
      paymentMethod: 'cash',
    });
    await db.exec('UPDATE sales SET created_at = ? WHERE id = ?', [
      '2020-01-01T05:00:00.000Z',
      sale.saleId,
    ]);

    expect((await summary(today)).saleCount).toBe(0);
  });
});

describe('top products', () => {
  it('ranks by takings and by quantity independently', async () => {
    const cheapButPopular = await product('Toffee', 1000, 700);
    const dearButRare = await product('Desi ghee', 240000, 218000);

    await completeSale({
      lines: [line(cheapButPopular, 1000, 700, 100)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 100000,
      paymentMethod: 'cash',
    });
    await completeSale({
      lines: [line(dearButRare, 240000, 218000, 1)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 240000,
      paymentMethod: 'cash',
    });

    const byRevenue = await topProducts(today, 'revenue');
    const byQty = await topProducts(today, 'qty');
    expect(byRevenue[0]?.revenuePaisa).toBe(240000);
    expect(byQty[0]?.qty).toBe(100);
  });

  it('groups the same product across separate sales', async () => {
    const sugar = await product('Sugar', 17000, 15800);
    for (let index = 0; index < 3; index += 1) {
      await completeSale({
        lines: [line(sugar, 17000, 15800, 2)],
        customerId: null,
        discountPaisa: 0,
        paidPaisa: 34000,
        paymentMethod: 'cash',
      });
    }
    const top = await topProducts(today, 'qty');
    expect(top).toHaveLength(1);
    expect(top[0]?.qty).toBe(6);
    expect(top[0]?.revenuePaisa).toBe(102000);
  });
});

describe('sales by day', () => {
  it('buckets by the Karachi calendar day, not the UTC one', async () => {
    const sugar = await product('Sugar', 17000, 15800);
    const sale = await completeSale({
      lines: [line(sugar, 17000, 15800)],
      customerId: null,
      discountPaisa: 0,
      paidPaisa: 17000,
      paymentMethod: 'cash',
    });

    // 21:30 UTC on the 4th is 02:30 on the 5th in Karachi, and belongs to the
    // 5th in the shop's book.
    await db.exec('UPDATE sales SET created_at = ? WHERE id = ?', [
      '2026-03-04T21:30:00.000Z',
      sale.saleId,
    ]);

    const days = await salesByDay({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-10T00:00:00.000Z',
      fromDay: '2026-03-01',
      toDay: '2026-03-09',
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.day).toBe('2026-03-05');
  });
});
