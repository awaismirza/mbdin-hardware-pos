import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTestDb, type TestDb } from '../testDb';
import { seedSampleCatalogue } from '../seed';
import {
  createProduct,
  getProduct,
  findByBarcode,
  listProducts,
  updateProduct,
  DuplicateFieldError,
  setProductPhoto,
  getProductPhoto,
  deleteProductPhoto,
} from './productsRepo';
import { applyMovement, listMovements, receiveStock, stockTake } from './stockRepo';
import { db } from '../client';

let handle: TestDb;

beforeEach(async () => {
  handle = await openTestDb();
});

afterEach(() => {
  handle.close();
});

async function makeProduct(overrides: Partial<Parameters<typeof createProduct>[0]> = {}) {
  return createProduct({
    nameUr: 'چینی',
    nameEn: 'Sugar',
    unit: 'kg',
    costPaisa: 15800,
    pricePaisa: 17000,
    lowStockThreshold: 5,
    isActive: true,
    openingQty: 24,
    ...overrides,
  });
}

describe('products', () => {
  it('stores a bilingual product and reads it back', async () => {
    const id = await makeProduct();
    const product = await getProduct(id);
    expect(product).toMatchObject({
      nameUr: 'چینی',
      nameEn: 'Sugar',
      unit: 'kg',
      pricePaisa: 17000,
      stockQty: 24,
      isActive: true,
      hasPhoto: false,
    });
  });

  it('writes an opening movement rather than setting a bare quantity', async () => {
    const id = await makeProduct({ openingQty: 12 });
    const movements = await listMovements(id);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ kind: 'opening', qtyDelta: 12 });
  });

  it('refuses a barcode that already belongs to another product', async () => {
    await makeProduct({ barcode: '8901234567890' });
    await expect(makeProduct({ nameEn: 'Other', barcode: '8901234567890' })).rejects.toBeInstanceOf(
      DuplicateFieldError,
    );
  });

  it('allows many products with no barcode at all', async () => {
    await makeProduct({ nameEn: 'One', barcode: '' });
    await makeProduct({ nameEn: 'Two', barcode: '' });
    await makeProduct({ nameEn: 'Three', sku: '' });
    const all = await listProducts();
    expect(all).toHaveLength(3);
  });

  it('finds a product by barcode', async () => {
    await makeProduct({ barcode: '8901234567890' });
    expect(await findByBarcode('8901234567890')).toMatchObject({ nameEn: 'Sugar' });
    expect(await findByBarcode(' 8901234567890 ')).not.toBeNull();
    expect(await findByBarcode('nope')).toBeNull();
  });

  it('keeps a product with only an Urdu name', async () => {
    const id = await createProduct({
      nameUr: 'ماچس',
      nameEn: '',
      unit: 'piece',
      costPaisa: 1000,
      pricePaisa: 1500,
      lowStockThreshold: 0,
      isActive: true,
    });
    expect((await getProduct(id))?.nameEn).toBeNull();
  });

  it('updates without touching stock', async () => {
    const id = await makeProduct();
    await updateProduct({
      id,
      nameUr: 'چینی',
      nameEn: 'Sugar',
      unit: 'kg',
      costPaisa: 16000,
      pricePaisa: 18000,
      lowStockThreshold: 8,
      isActive: true,
    });
    const product = await getProduct(id);
    expect(product?.pricePaisa).toBe(18000);
    expect(product?.stockQty).toBe(24);
  });
});

describe('search', () => {
  it('matches Urdu name, English name, SKU and barcode', async () => {
    await makeProduct({ sku: 'SG1', barcode: '8901111111111' });
    expect(await listProducts({ search: 'چین' })).toHaveLength(1);
    expect(await listProducts({ search: 'sug' })).toHaveLength(1);
    expect(await listProducts({ search: 'SG1' })).toHaveLength(1);
    expect(await listProducts({ search: '89011111' })).toHaveLength(1);
    expect(await listProducts({ search: 'zzz' })).toHaveLength(0);
  });

  it('puts an exact barcode match first', async () => {
    await makeProduct({ nameEn: 'Sugar refill', barcode: '111' });
    await makeProduct({ nameEn: 'Sugar', sku: 'S2', barcode: '222' });
    const found = await listProducts({ search: '222' });
    expect(found[0]?.nameEn).toBe('Sugar');
  });

  it('searches 400 products in well under 100ms', async () => {
    const made = await seedSampleCatalogue({ count: 400 });
    expect(made).toBe(400);

    const started = performance.now();
    const found = await listProducts({ search: 'چین' });
    const elapsed = performance.now() - started;

    expect(found.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  it('filters low and out of stock', async () => {
    await makeProduct({ nameEn: 'Plenty', openingQty: 50, lowStockThreshold: 5 });
    await makeProduct({ nameEn: 'Running low', sku: 'L', openingQty: 3, lowStockThreshold: 5 });
    await makeProduct({ nameEn: 'Gone', sku: 'G', openingQty: 0, lowStockThreshold: 5 });

    expect((await listProducts({ filter: 'low' })).map((p) => p.nameEn)).toEqual(['Running low']);
    expect((await listProducts({ filter: 'out' })).map((p) => p.nameEn)).toEqual(['Gone']);
  });
});

describe('stock movements', () => {
  it('moves the quantity and the history together', async () => {
    const id = await makeProduct({ openingQty: 10 });
    await applyMovement({ productId: id, kind: 'purchase', qtyDelta: 5 });
    expect((await getProduct(id))?.stockQty).toBe(15);
    expect(await listMovements(id)).toHaveLength(2);
  });

  it('receives stock and can update the cost at the same time', async () => {
    const id = await makeProduct({ openingQty: 10, costPaisa: 15800 });
    await receiveStock(id, 20, 16200);
    const product = await getProduct(id);
    expect(product?.stockQty).toBe(30);
    expect(product?.costPaisa).toBe(16200);
  });

  it('keeps the old cost when none is given', async () => {
    const id = await makeProduct({ openingQty: 10, costPaisa: 15800 });
    await receiveStock(id, 20, null);
    expect((await getProduct(id))?.costPaisa).toBe(15800);
  });

  it('writes the difference as an adjustment on a stock take', async () => {
    const id = await makeProduct({ openingQty: 24 });
    const delta = await stockTake(id, 21.5, 'stock take');
    expect(delta).toBe(-2.5);
    const product = await getProduct(id);
    expect(product?.stockQty).toBe(21.5);
    const [latest] = await listMovements(id);
    expect(latest).toMatchObject({ kind: 'adjustment', qtyDelta: -2.5, note: 'stock take' });
  });

  it('writes nothing when the count already agrees', async () => {
    const id = await makeProduct({ openingQty: 24 });
    expect(await stockTake(id, 24, 'stock take')).toBe(0);
    expect(await listMovements(id)).toHaveLength(1);
  });

  it('allows stock to go negative, because the shelf beats the book', async () => {
    const id = await makeProduct({ openingQty: 1 });
    await applyMovement({ productId: id, kind: 'sale', qtyDelta: -3 });
    expect((await getProduct(id))?.stockQty).toBe(-2);
  });

  it('keeps decimal quantities exact for weighed goods', async () => {
    const id = await makeProduct({ openingQty: 0 });
    await applyMovement({ productId: id, kind: 'purchase', qtyDelta: 0.1 });
    await applyMovement({ productId: id, kind: 'purchase', qtyDelta: 0.2 });
    expect((await getProduct(id))?.stockQty).toBe(0.3);
  });
});

describe('photos', () => {
  it('round-trips bytes and reports hasPhoto without loading them', async () => {
    const id = await makeProduct();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    await setProductPhoto(id, { mime: 'image/jpeg', width: 640, height: 480, bytes });

    expect((await getProduct(id))?.hasPhoto).toBe(true);
    const stored = await getProductPhoto(id);
    expect(stored?.width).toBe(640);
    expect(Array.from(stored!.bytes)).toEqual(Array.from(bytes));

    await deleteProductPhoto(id);
    expect((await getProduct(id))?.hasPhoto).toBe(false);
  });

  it('goes with the product when the product is deleted', async () => {
    const id = await makeProduct();
    await setProductPhoto(id, {
      mime: 'image/jpeg',
      width: 1,
      height: 1,
      bytes: new Uint8Array([1]),
    });
    await db.exec('DELETE FROM products WHERE id = ?', [id]);
    expect(await getProductPhoto(id)).toBeNull();
  });
});
