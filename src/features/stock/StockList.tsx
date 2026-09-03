import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLanguage, useT } from '../../appStore';
import { EmptyState } from '../../components/EmptyState';
import { listProducts, type StockFilter } from '../../db/repos/productsRepo';
import { pickName } from '../../i18n';
import { formatPKR, formatQty } from '../../lib/money';
import type { Product } from '../../types/domain';

const FILTERS: readonly { key: StockFilter; label: `stock.filter.${string}` }[] = [
  { key: 'all', label: 'stock.filter.all' },
  { key: 'low', label: 'stock.filter.low' },
  { key: 'out', label: 'stock.filter.out' },
  { key: 'inactive', label: 'stock.filter.inactive' },
] as const;

export function StockList() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 120 ms: long enough to skip a keystroke burst, short enough that the list
    // still feels like it is tracking the typing.
    const timer = setTimeout(() => {
      void listProducts({ search, filter }).then((found) => {
        if (!cancelled) setProducts(found);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, filter]);

  const empty = products !== null && products.length === 0;
  const emptyText = useMemo(
    () => (search.trim() ? t('sell.noMatches') : t('stock.empty')),
    [search, t],
  );

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('stock.title')}</h1>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => navigate('/stock/product/new')}
        >
          {t('stock.addProduct')}
        </button>
      </div>

      <div className="stock-toolbar">
        <input
          className="input grow"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('sell.searchPlaceholder')}
          aria-label={t('action.search')}
        />
        <button type="button" className="btn" onClick={() => navigate('/stock/import')}>
          CSV
        </button>
      </div>

      <div className="chip-row" style={{ paddingInline: 'var(--s4)' }}>
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="chip"
            aria-pressed={filter === entry.key}
            onClick={() => setFilter(entry.key)}
          >
            {t(entry.label as never)}
          </button>
        ))}
      </div>

      <div className="screen__body">
        {products === null && <div className="empty">{t('common.loading')}</div>}
        {empty && (
          <EmptyState
            text={emptyText}
            action={
              search.trim() ? undefined : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate('/stock/product/new')}
                >
                  {t('stock.addProduct')}
                </button>
              )
            }
          />
        )}

        {products?.map((product) => {
          const out = product.stockQty <= 0;
          const low =
            !out && product.lowStockThreshold > 0 && product.stockQty <= product.lowStockThreshold;
          return (
            <button
              key={product.id}
              type="button"
              className={`list__row${low ? ' list__row--flag' : ''}${
                out ? ' list__row--flag list__row--flag-out' : ''
              }`}
              onClick={() => navigate(`/stock/product/${product.id}/detail`)}
            >
              <span className="list__main">
                <span className="list__name truncate">
                  {pickName(language, product.nameUr, product.nameEn)}
                </span>
                <span className="list__meta num">
                  {formatQty(product.stockQty)} {t(`unit.${product.unit}`)}
                  {!product.isActive ? ` · ${t('stock.filter.inactive')}` : ''}
                </span>
              </span>
              <span className="stock-row__figures">
                <span className="money">{formatPKR(product.pricePaisa)}</span>
                {out && <span className="tag tag--out">{t('sell.outOfStock')}</span>}
                {low && <span className="tag tag--low">{t('sell.lowStock')}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
