import { useEffect, useState } from 'react';

import { useLanguage, useT } from '../../appStore';
import { EmptyState } from '../../components/EmptyState';
import { ProductPhoto } from '../../components/ProductPhoto';
import { listCategories, listProducts } from '../../db/repos/productsRepo';
import { pickName } from '../../i18n';
import { formatPKR, formatQty } from '../../lib/money';
import type { Category, Product } from '../../types/domain';

interface CatalogueGridProps {
  search: string;
  onPick: (product: Product) => void;
  onQuickSell: () => void;
  /** Rendered when a search matched nothing and looks like a barcode. */
  unknownBarcode?: string | null;
  onAddWithBarcode?: (barcode: string) => void;
}

export function CatalogueGrid({
  search,
  onPick,
  onQuickSell,
  unknownBarcode,
  onAddWithBarcode,
}: CatalogueGridProps) {
  const t = useT();
  const language = useLanguage();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  useEffect(() => {
    void listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 120ms, per the spec: enough to skip a keystroke burst on a slow tablet,
    // short enough that the grid still feels attached to the typing.
    const timer = setTimeout(() => {
      void listProducts({ search, categoryId, limit: 300 }).then((found) => {
        if (!cancelled) setProducts(found);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, categoryId]);

  const nothingFound = products !== null && products.length === 0;

  return (
    <div className="catalogue">
      {categories.length > 0 && (
        <div className="catalogue__chips">
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              aria-pressed={categoryId === null}
              onClick={() => setCategoryId(null)}
            >
              {t('common.all')}
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="chip"
                aria-pressed={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              >
                {pickName(language, category.nameUr, category.nameEn)}
              </button>
            ))}
          </div>
        </div>
      )}

      {nothingFound ? (
        <EmptyState
          text={search.trim() ? t('sell.noMatches') : t('sell.noProducts')}
          action={
            unknownBarcode && onAddWithBarcode ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onAddWithBarcode(unknownBarcode)}
              >
                {t('sell.addWithBarcode')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="catalogue__grid">
          <button type="button" className="tile tile--quick" onClick={onQuickSell}>
            {t('sell.quickSell')}
          </button>

          {products?.map((product) => {
            const out = product.stockQty <= 0;
            const low =
              !out &&
              product.lowStockThreshold > 0 &&
              product.stockQty <= product.lowStockThreshold;
            return (
              <button
                key={product.id}
                type="button"
                className={`tile${out ? ' tile--out' : ''}`}
                onClick={() => onPick(product)}
              >
                <ProductPhoto
                  productId={product.id}
                  hasPhoto={product.hasPhoto}
                  name={pickName(language, product.nameUr, product.nameEn)}
                  className="tile__thumb"
                />
                <span className="tile__name">
                  {pickName(language, product.nameUr, product.nameEn)}
                </span>
                <span className="tile__price num">{formatPKR(product.pricePaisa)}</span>
                <span
                  className={`tile__stock${out ? ' tile__stock--out' : low ? ' tile__stock--low' : ''}`}
                >
                  {formatQty(product.stockQty)} {t(`unit.${product.unit}` as never)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
