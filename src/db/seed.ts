/**
 * A sample catalogue, for development and for the performance check in M2
 * ("400 seeded products search in under 100 ms").
 *
 * The names are the things a general store in Mandi Bahauddin actually sells,
 * because a catalogue of "Product 1 … Product 400" tells you nothing about how
 * the search feels when every row starts with the same two Urdu letters.
 */

import { nowIso } from '../lib/dates';
import type { TxStep } from './api';
import { db, lastIdOf } from './client';
import type { Unit } from '../types/domain';

interface SeedItem {
  ur: string;
  en: string;
  unit: Unit;
  price: number; // rupees
  cost: number; // rupees
  qty: number;
  category: string;
}

const CATEGORIES: Array<[string, string]> = [
  ['آٹا اور چاول', 'Flour & rice'],
  ['گھی اور تیل', 'Ghee & oil'],
  ['چینی اور چائے', 'Sugar & tea'],
  ['دالیں اور مصالحے', 'Pulses & spices'],
  ['دودھ اور ڈبے', 'Dairy & tinned'],
  ['صابن اور صفائی', 'Soap & cleaning'],
  ['بسکٹ اور ٹافی', 'Biscuits & sweets'],
  ['مشروبات', 'Drinks'],
];

const BASE: SeedItem[] = [
  { ur: 'آٹا', en: 'Atta', unit: 'kg', price: 145, cost: 132, qty: 220, category: 'آٹا اور چاول' },
  { ur: 'میدہ', en: 'Maida', unit: 'kg', price: 160, cost: 145, qty: 60, category: 'آٹا اور چاول' },
  { ur: 'باسمتی چاول', en: 'Basmati rice', unit: 'kg', price: 340, cost: 310, qty: 90, category: 'آٹا اور چاول' },
  { ur: 'سیلا چاول', en: 'Sella rice', unit: 'kg', price: 260, cost: 238, qty: 75, category: 'آٹا اور چاول' },
  { ur: 'ڈالڈا گھی', en: 'Dalda ghee', unit: 'kg', price: 720, cost: 668, qty: 18, category: 'گھی اور تیل' },
  { ur: 'کوکنگ آئل', en: 'Cooking oil', unit: 'litre', price: 640, cost: 592, qty: 24, category: 'گھی اور تیل' },
  { ur: 'دیسی گھی', en: 'Desi ghee', unit: 'kg', price: 2400, cost: 2180, qty: 6, category: 'گھی اور تیل' },
  { ur: 'چینی', en: 'Sugar', unit: 'kg', price: 170, cost: 158, qty: 240, category: 'چینی اور چائے' },
  { ur: 'لپٹن چائے', en: 'Lipton tea', unit: 'packet', price: 260, cost: 238, qty: 40, category: 'چینی اور چائے' },
  { ur: 'ٹپال چائے', en: 'Tapal tea', unit: 'packet', price: 280, cost: 256, qty: 35, category: 'چینی اور چائے' },
  { ur: 'چنا دال', en: 'Chana daal', unit: 'kg', price: 290, cost: 264, qty: 55, category: 'دالیں اور مصالحے' },
  { ur: 'ماش دال', en: 'Mash daal', unit: 'kg', price: 420, cost: 388, qty: 30, category: 'دالیں اور مصالحے' },
  { ur: 'مسور دال', en: 'Masoor daal', unit: 'kg', price: 310, cost: 284, qty: 42, category: 'دالیں اور مصالحے' },
  { ur: 'لال مرچ', en: 'Red chilli', unit: 'kg', price: 780, cost: 700, qty: 12, category: 'دالیں اور مصالحے' },
  { ur: 'ہلدی', en: 'Turmeric', unit: 'kg', price: 560, cost: 500, qty: 9, category: 'دالیں اور مصالحے' },
  { ur: 'نمک', en: 'Salt', unit: 'kg', price: 45, cost: 36, qty: 120, category: 'دالیں اور مصالحے' },
  { ur: 'دودھ پتی', en: 'Milk pack', unit: 'litre', price: 230, cost: 214, qty: 28, category: 'دودھ اور ڈبے' },
  { ur: 'ڈبہ دودھ', en: 'Tinned milk', unit: 'piece', price: 190, cost: 172, qty: 36, category: 'دودھ اور ڈبے' },
  { ur: 'انڈے', en: 'Eggs', unit: 'dozen', price: 320, cost: 292, qty: 22, category: 'دودھ اور ڈبے' },
  { ur: 'لائف بوائے صابن', en: 'Lifebuoy soap', unit: 'piece', price: 130, cost: 116, qty: 64, category: 'صابن اور صفائی' },
  { ur: 'سرف', en: 'Washing powder', unit: 'kg', price: 340, cost: 310, qty: 26, category: 'صابن اور صفائی' },
  { ur: 'ہارپک', en: 'Harpic', unit: 'piece', price: 380, cost: 348, qty: 14, category: 'صابن اور صفائی' },
  { ur: 'ٹوتھ پیسٹ', en: 'Toothpaste', unit: 'piece', price: 220, cost: 198, qty: 30, category: 'صابن اور صفائی' },
  { ur: 'بسکٹ', en: 'Biscuits', unit: 'packet', price: 60, cost: 50, qty: 150, category: 'بسکٹ اور ٹافی' },
  { ur: 'ٹافی', en: 'Toffee', unit: 'piece', price: 10, cost: 7, qty: 500, category: 'بسکٹ اور ٹافی' },
  { ur: 'چپس', en: 'Crisps', unit: 'packet', price: 50, cost: 41, qty: 90, category: 'بسکٹ اور ٹافی' },
  { ur: 'کولڈ ڈرنک', en: 'Cold drink', unit: 'piece', price: 90, cost: 76, qty: 72, category: 'مشروبات' },
  { ur: 'منرل واٹر', en: 'Mineral water', unit: 'litre', price: 70, cost: 58, qty: 48, category: 'مشروبات' },
  { ur: 'جوس', en: 'Juice', unit: 'piece', price: 120, cost: 104, qty: 33, category: 'مشروبات' },
  { ur: 'ماچس', en: 'Matches', unit: 'piece', price: 15, cost: 10, qty: 200, category: 'صابن اور صفائی' },
];

/** Suffixes that make a realistic long catalogue out of a short one. */
const VARIANTS = [
  ['', ''],
  ['چھوٹا', 'small'],
  ['بڑا', 'large'],
  ['اکنامی پیک', 'economy pack'],
  ['فیملی پیک', 'family pack'],
  ['ہاف کلو', 'half kg'],
  ['ڈبل پیک', 'twin pack'],
  ['ریفل', 'refill'],
  ['پریمیم', 'premium'],
  ['لوکل', 'local'],
  ['امپورٹڈ', 'imported'],
  ['سپیشل', 'special'],
  ['ویلیو پیک', 'value pack'],
  ['منی پیک', 'mini pack'],
];

export interface SeedOptions {
  /** Total products to create. The M2 acceptance figure is 400. */
  count?: number;
}

export async function seedSampleCatalogue({ count = 400 }: SeedOptions = {}): Promise<number> {
  const now = nowIso();

  const categoryIds = new Map<string, number>();
  for (const [ur, en] of CATEGORIES) {
    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM categories WHERE name_ur = ?',
      [ur],
    );
    if (existing) {
      categoryIds.set(ur, existing.id);
      continue;
    }
    const created = await db.exec(
      `INSERT INTO categories (name_en, name_ur, sort_order, created_at) VALUES (?,?,?,?)`,
      [en, ur, categoryIds.size, now],
    );
    categoryIds.set(ur, created.lastId);
  }

  const steps: TxStep[] = [];
  let made = 0;

  for (let index = 0; made < count; index += 1) {
    const base = BASE[index % BASE.length]!;
    const variant = VARIANTS[Math.floor(index / BASE.length) % VARIANTS.length]!;
    const suffixUr = variant[0] ? ` ${variant[0]}` : '';
    const suffixEn = variant[1] ? ` ${variant[1]}` : '';

    // A little spread so low-stock and out-of-stock rows exist to look at.
    const qty = index % 17 === 0 ? 0 : index % 11 === 0 ? 2 : base.qty;
    const priceStep = 1 + (Math.floor(index / BASE.length) % VARIANTS.length) * 0.08;

    steps.push({
      sql: `INSERT INTO products
              (sku, barcode, name_en, name_ur, category_id, unit, cost_paisa, price_paisa,
               stock_qty, low_stock_threshold, is_active, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      params: [
        `SKU${String(index + 1).padStart(4, '0')}`,
        // Only about half of a real shop's lines are barcoded.
        index % 2 === 0 ? `890${String(1000000 + index).padStart(10, '0')}` : null,
        `${base.en}${suffixEn}`,
        `${base.ur}${suffixUr}`,
        categoryIds.get(base.category) ?? null,
        base.unit,
        Math.round(base.cost * 100 * priceStep),
        Math.round(base.price * 100 * priceStep),
        qty,
        5,
        now,
        now,
      ],
    });
    steps.push({
      sql: `INSERT INTO stock_movements (product_id, kind, qty_delta, sale_id, note, created_at)
            VALUES (?, 'opening', ?, NULL, 'seed', ?)`,
      params: [lastIdOf(steps.length - 1), qty, now],
    });
    made += 1;
  }

  await db.transaction(steps);
  return made;
}
