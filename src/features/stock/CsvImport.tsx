import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useT, useToast } from '../../appStore';
import { db } from '../../db/client';
import { createProduct, findOrCreateCategory, updateProduct } from '../../db/repos/productsRepo';
import { guessMapping, readTable, PRODUCT_FIELDS, type ProductField } from '../../lib/csv';
import { parsePaisa, roundQty } from '../../lib/money';
import { toUnit } from '../../db/repos/rows';

interface Loaded {
  headers: string[];
  rows: string[][];
  mapping: Record<ProductField, number>;
}

/**
 * How a shop with four hundred lines gets started without typing them.
 *
 * Column mapping is guessed from the headings and then shown for confirmation,
 * because someone else's spreadsheet will not use our names. A row with no name
 * or no price is skipped rather than imported half-formed, and the count of
 * skipped rows is reported honestly at the end.
 */
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

        // Match on barcode then SKU, so re-importing a supplier's updated price
        // list edits the shop's products instead of duplicating them.
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
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/stock')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title">{t('import.title')}</h1>
      </div>

      <div className="screen__body">
        <div className="screen__pad">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="visually-hidden"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => input.current?.click()}
          >
            {t('import.choose')}
          </button>
        </div>

        {loaded && (
          <>
            <p className="screen__pad meta">{t('import.rowsFound', { count: loaded.rows.length })}</p>

            <div className="section-head">{t('import.mapColumns')}</div>
            <div className="import-map">
              {PRODUCT_FIELDS.map((field) => (
                <div key={field} className="import-map__row">
                  <span>{fieldLabel(field, t)}</span>
                  <select
                    className="select"
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

            <div className="section-head">{t('import.preview')}</div>
            <div className="preview-table">
              <table>
                <thead>
                  <tr>
                    {loaded.headers.map((header, index) => (
                      <th key={`${header}-${index}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loaded.rows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {loaded.headers.map((_, columnIndex) => (
                        <td key={columnIndex}>{row[columnIndex] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="screen__pad">
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={busy}
                onClick={() => void run()}
              >
                {busy ? t('common.saving') : t('import.run', { count: loaded.rows.length })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
