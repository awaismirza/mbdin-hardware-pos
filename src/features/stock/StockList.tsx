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
import { formatPKR, formatQty, marginPercent } from '@/lib/money';
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

  // The bar in each on-hand cell is proportional to the deepest shelf in view,
  // so the row that needs restocking is visibly the shortest one.
  const maxQty = useMemo(
    () => Math.max(1, ...(products ?? []).map((product) => product.stockQty)),
    [products],
  );

  return (
    <Screen
      title={t('stock.title')}
      subtitle={products ? t('stock.subtitle', { count: summary.total }) : undefined}
      scroll={false}
      actions={
        <Button size="sm" onClick={() => navigate('/stock/product/new')}>
          <Plus className="size-4" /> {t('stock.addProduct')}
        </Button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 p-4">
          {/* Rectangular status tabs with counts, then search. */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                className={cn(
                  'h-9 flex-none rounded-[10px] border px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                  filter === entry.key
                    ? 'border-fg bg-fg text-bg'
                    : 'border-line bg-panel text-fg2 hover:text-fg',
                )}
              >
                {t(entry.label as never)}
                {entry.key !== 'inactive' && products && (
                  <span className="num ms-1.5 opacity-65">{countFor(entry.key, summary)}</span>
                )}
              </button>
            ))}
            <span className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => navigate('/stock/import')}>
              CSV
            </Button>
          </div>

          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('sell.searchPlaceholder')}
            aria-label={t('action.search')}
          />

          {products === null && <p className="p-8 text-center text-fg2">{t('common.loading')}</p>}
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
            <div className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-card">
              <div className="label-caps hidden grid-cols-[minmax(0,1fr)_110px_90px_170px] gap-3 border-b border-line bg-panel2 px-4 py-2.5 md:grid">
                <span>{t('stock.colProduct')}</span>
                <span className="text-end">{t('common.price')}</span>
                <span className="text-end">{t('stock.margin')}</span>
                <span>{t('stock.colOnHand')}</span>
              </div>

              {products.map((product) => (
                <StockRow
                  key={product.id}
                  product={product}
                  name={pickName(language, product.nameUr, product.nameEn)}
                  maxQty={maxQty}
                  onOpen={() => navigate(`/stock/product/${product.id}/detail`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

function countFor(key: StockFilter, summary: { total: number; low: number; out: number }): number {
  if (key === 'low') return summary.low;
  if (key === 'out') return summary.out;
  return summary.total;
}

/**
 * One row of the stock table. The on-hand cell pairs a status badge with a
 * proportional bar in the same tone, so "how much is left" reads at a glance
 * without the shopkeeper having to compare two numbers.
 */
function StockRow({
  product,
  name,
  maxQty,
  onOpen,
}: {
  product: Product;
  name: string;
  maxQty: number;
  onOpen: () => void;
}) {
  const t = useT();
  const out = product.stockQty <= 0;
  const low =
    !out && product.lowStockThreshold > 0 && product.stockQty <= product.lowStockThreshold;
  const tone = out ? 'bad' : low ? 'warn' : 'ok';
  const fill = maxQty > 0 ? Math.max(0, Math.min(100, (product.stockQty / maxQty) * 100)) : 0;
  // SKU and barcode are numeric runs in their own right, so the whole line is
  // mono. The unit fallback is mixed text and keeps the sans face.
  const code = product.sku || product.barcode || '';

  return (
    <button
      type="button"
      data-testid="stock-card"
      onClick={onOpen}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-3 text-start last:border-b-0 hover:bg-panel2',
        'md:grid-cols-[minmax(0,1fr)_110px_90px_170px]',
        !product.isActive && 'opacity-60',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <ProductPhoto
          productId={product.id}
          hasPhoto={product.hasPhoto}
          name={name}
          className="size-10 flex-none rounded-[10px] bg-panel2 object-cover text-[10px] font-semibold text-fg2 [&:is(span)]:grid [&:is(span)]:place-items-center"
        />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{name}</span>
          <span className="block truncate text-[11px] text-fg2">
            {code ? (
              <span className="num">{code}</span>
            ) : (
              t(`unit.${product.unit}`)
            )}
            {!product.isActive && ` · ${t('stock.filter.inactive')}`}
          </span>
        </span>
      </span>

      <span className="num text-end text-[13.5px] font-semibold md:order-none">
        {formatPKR(product.pricePaisa)}
      </span>

      <span className="num hidden text-end text-[12.5px] text-fg2 md:block">
        {product.costPaisa > 0
          ? `${String(marginPercent(product.pricePaisa, product.costPaisa))}%`
          : '—'}
      </span>

      <span className="col-span-2 md:col-span-1">
        <span className="mb-1.5 flex items-center gap-2">
          <span className="text-[12.5px] font-semibold" data-testid="stock-qty">
            <span className="num">{formatQty(product.stockQty)}</span>{' '}
            {t(`unit.${product.unit}`)}
          </span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10.5px] font-bold',
              tone === 'bad' && 'bg-bad-soft text-bad',
              tone === 'warn' && 'bg-warn-soft text-warn',
              tone === 'ok' && 'bg-ok-soft text-ok',
            )}
          >
            {out ? t('sell.outOfStock') : low ? t('sell.lowStock') : t('sell.inStock')}
          </span>
        </span>
        <span className="block h-[5px] overflow-hidden rounded-[3px] bg-panel2">
          <span
            className={cn(
              'block h-full rounded-[3px]',
              tone === 'bad' && 'bg-bad',
              tone === 'warn' && 'bg-warn',
              tone === 'ok' && 'bg-ok',
            )}
            style={{ inlineSize: `${String(fill)}%` }}
          />
        </span>
      </span>
    </button>
  );
}
