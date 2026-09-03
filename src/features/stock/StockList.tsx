import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { useLanguage, useT } from '@/appStore';
import { EmptyState } from '@/components/EmptyState';
import { ProductPhoto } from '@/components/ProductPhoto';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listProducts, type StockFilter } from '@/db/repos/productsRepo';
import { pickName } from '@/i18n';
import { formatPKR, formatQty } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/domain';

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
  const summary = useMemo(() => {
    const items = products ?? [];
    return {
      total: items.length,
      low: items.filter(
        (p) => p.stockQty > 0 && p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold,
      ).length,
      out: items.filter((p) => p.stockQty <= 0).length,
    };
  }, [products]);

  return (
    <Screen
      title={t('stock.title')}
      scroll={false}
      actions={
        <Button size="sm" onClick={() => navigate('/stock/product/new')}>
          <Plus className="size-4" /> {t('stock.addProduct')}
        </Button>
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b bg-card p-3">
        <Input
          className="flex-1"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('sell.searchPlaceholder')}
          aria-label={t('action.search')}
        />
        <Button variant="outline" onClick={() => navigate('/stock/import')}>
          CSV
        </Button>
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={filter === entry.key}
            onClick={() => setFilter(entry.key)}
            className={cn(
              'h-9 flex-none rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
              filter === entry.key
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(entry.label as never)}
          </button>
        ))}
      </div>

      {products && (
        <div
          className="flex shrink-0 gap-4 border-b px-4 py-2 text-sm text-muted-foreground"
          aria-label="Stock summary"
        >
          <span>
            <strong className="num text-foreground">{summary.total}</strong> {t('stock.title')}
          </span>
          <span>
            <strong className={cn('num', summary.low > 0 && 'text-warning')}>{summary.low}</strong>{' '}
            {t('sell.lowStock')}
          </span>
          <span>
            <strong className={cn('num', summary.out > 0 && 'text-destructive')}>{summary.out}</strong>{' '}
            {t('sell.outOfStock')}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {products === null && (
          <p className="p-8 text-center text-muted-foreground">{t('common.loading')}</p>
        )}
        {empty && (
          <EmptyState
            text={emptyText}
            action={
              search.trim() ? undefined : (
                <Button onClick={() => navigate('/stock/product/new')}>
                  {t('stock.addProduct')}
                </Button>
              )
            }
          />
        )}

        {products && products.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {products.map((product) => {
              const out = product.stockQty <= 0;
              const low =
                !out &&
                product.lowStockThreshold > 0 &&
                product.stockQty <= product.lowStockThreshold;
              const name = pickName(language, product.nameUr, product.nameEn);
              return (
                <button
                  key={product.id}
                  type="button"
                  data-testid="stock-card"
                  onClick={() => navigate(`/stock/product/${product.id}/detail`)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border bg-card p-3 text-start transition-all hover:border-primary/40 hover:shadow-sm',
                    low && 'border-s-2 border-s-warning',
                    out && 'border-s-2 border-s-destructive opacity-70',
                  )}
                >
                  <ProductPhoto
                    productId={product.id}
                    hasPhoto={product.hasPhoto}
                    name={name}
                    className="size-16 flex-none rounded-lg border bg-muted object-cover text-sm font-semibold text-muted-foreground [&:is(span)]:grid [&:is(span)]:place-items-center"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="num block text-sm text-muted-foreground">
                      {formatQty(product.stockQty)} {t(`unit.${product.unit}`)}
                      {!product.isActive ? ` · ${t('stock.filter.inactive')}` : ''}
                    </span>
                  </span>
                  <span className="grid justify-items-end gap-1">
                    <span className="money">{formatPKR(product.pricePaisa)}</span>
                    {out && (
                      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        {t('sell.outOfStock')}
                      </span>
                    )}
                    {low && (
                      <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        {t('sell.lowStock')}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}
