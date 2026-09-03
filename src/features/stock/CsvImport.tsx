import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useT, useToast } from '@/appStore';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { db } from '@/db/client';
import { createProduct, findOrCreateCategory, updateProduct } from '@/db/repos/productsRepo';
import { guessMapping, readTable, PRODUCT_FIELDS, type ProductField } from '@/lib/csv';
import { parsePaisa, roundQty } from '@/lib/money';
import { toUnit } from '@/db/repos/rows';

interface Loaded {
  headers: string[];
  rows: string[][];
  mapping: Record<ProductField, number>;
}

const SELECT_CLASS =
  'h-11 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40';

export function CsvImport() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const { headers, rows } = readTable(text);
      if (headers.length === 0 || rows.length === 0) {
        toast(t('import.badFile'), 'bad');
        return;
      }
      setLoaded({ headers, rows, mapping: guessMapping(headers) });
    } catch {
      toast(t('import.badFile'), 'bad');
    }
  }

  function setColumn(field: ProductField, index: number) {
    setLoaded((current) =>
      current ? { ...current, mapping: { ...current.mapping, [field]: index } } : current,
    );
  }

  async function run() {
    if (!loaded) return;
    const { rows, mapping } = loaded;

    if (mapping.nameEn === -1 && mapping.nameUr === -1) {
      toast(t('import.needName'), 'warn');
      return;
    }
    if (mapping.price === -1) {
      toast(t('import.needPrice'), 'warn');
      return;
    }

    setBusy(true);
    try {
      const categoryIds = new Map<string, number | null>();
      let added = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const cell = (field: ProductField): string => {
          const index = mapping[field] ?? -1;
          if (index < 0) return '';
          return (row[index] ?? '').trim();
        };

        const nameEn = cell('nameEn');
        const nameUr = cell('nameUr');
        const pricePaisa = parsePaisa(cell('price'));

        if ((!nameEn && !nameUr) || pricePaisa === null) {
          skipped += 1;
          continue;
        }

        const categoryName = cell('category');
        if (categoryName && !categoryIds.has(categoryName)) {
          categoryIds.set(categoryName, await findOrCreateCategory(categoryName));
        }

        const barcode = cell('barcode');
        const sku = cell('sku');
        const draft = {
          nameEn,
          nameUr,
          sku,
          barcode,
          categoryId: categoryName ? (categoryIds.get(categoryName) ?? null) : null,
          unit: toUnit(cell('unit').toLowerCase()),
          costPaisa: parsePaisa(cell('cost')) ?? 0,
          pricePaisa,
          lowStockThreshold: roundQty(Number(cell('lowStock')) || 0),
          isActive: true,
        };

        const existing = await findExisting(barcode, sku);
        if (existing) {
          await updateProduct({ ...draft, id: existing });
          updated += 1;
        } else {
          await createProduct({ ...draft, openingQty: roundQty(Number(cell('stock')) || 0) });
          added += 1;
        }
      }

      toast(t('import.done', { added, updated }));
      if (skipped > 0) toast(t('import.failedRows', { count: skipped }), 'warn');
      navigate('/stock');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t('import.title')} onBack={() => navigate('/stock')}>
      <div className="grid gap-4 p-4">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button className="w-full" onClick={() => input.current?.click()}>
          {t('import.choose')}
        </Button>

        {loaded && (
          <>
            <p className="text-sm text-muted-foreground">
              {t('import.rowsFound', { count: loaded.rows.length })}
            </p>

            <h2 className="text-base font-semibold">{t('import.mapColumns')}</h2>
            <div className="grid gap-3">
              {PRODUCT_FIELDS.map((field) => (
                <div key={field} className="grid grid-cols-2 items-center gap-3">
                  <span className="text-sm">{fieldLabel(field, t)}</span>
                  <select
                    className={SELECT_CLASS}
                    value={loaded.mapping[field]}
                    onChange={(event) => setColumn(field, Number(event.target.value))}
                  >
                    <option value={-1}>{t('import.ignore')}</option>
                    {loaded.headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `${t('import.column')} ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <h2 className="text-base font-semibold">{t('import.preview')}</h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {loaded.headers.map((header, index) => (
                      <th
                        key={`${header}-${index}`}
                        className="whitespace-nowrap px-3 py-2 text-start font-semibold"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loaded.rows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b last:border-0">
                      {loaded.headers.map((_, columnIndex) => (
                        <td key={columnIndex} className="whitespace-nowrap px-3 py-2">
                          {row[columnIndex] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button className="w-full" disabled={busy} onClick={() => void run()}>
              {busy ? t('common.saving') : t('import.run', { count: loaded.rows.length })}
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}

async function findExisting(barcode: string, sku: string): Promise<number | null> {
  if (barcode) {
    const row = await db.queryOne<{ id: number }>('SELECT id FROM products WHERE barcode = ?', [
      barcode,
    ]);
    if (row) return row.id;
  }
  if (sku) {
    const row = await db.queryOne<{ id: number }>('SELECT id FROM products WHERE sku = ?', [sku]);
    if (row) return row.id;
  }
  return null;
}

function fieldLabel(field: ProductField, t: (key: never) => string): string {
  const keys: Record<ProductField, string> = {
    nameEn: 'stock.nameEn',
    nameUr: 'stock.nameUr',
    sku: 'common.sku',
    barcode: 'common.barcode',
    category: 'common.category',
    unit: 'common.unit',
    price: 'common.price',
    cost: 'common.cost',
    stock: 'stock.openingStock',
    lowStock: 'stock.lowThreshold',
  };
  return t(keys[field] as never);
}
