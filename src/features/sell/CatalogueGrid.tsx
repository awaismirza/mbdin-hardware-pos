import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { useLanguage, useT } from '@/appStore';
import { EmptyState } from '@/components/EmptyState';
import { ProductPhoto } from '@/components/ProductPhoto';
import { Button } from '@/components/ui/button';
import { listCategories, listProducts } from '@/db/repos/productsRepo';
import { pickName } from '@/i18n';
import { formatPKR, formatQty } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { Category, Product } from '@/types/domain';

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {categories.length > 0 && (
        <div className="shrink-0 border-b px-3 py-2">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
              {t('common.all')}
            </Chip>
            {categories.map((category) => (
              <Chip
                key={category.id}
                active={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              >
                {pickName(language, category.nameUr, category.nameEn)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {nothingFound ? (
        <EmptyState
          text={search.trim() ? t('sell.noMatches') : t('sell.noProducts')}
          action={
            unknownBarcode && onAddWithBarcode ? (
              <Button onClick={() => onAddWithBarcode(unknownBarcode)}>
                {t('sell.addWithBarcode')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          data-testid="catalogue-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
            <button
              type="button"
              onClick={onQuickSell}
              className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary/50 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
            >
              <Plus className="size-5" />
              {t('sell.quickSell')}
            </button>

            {products?.map((product) => {
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
                  data-testid="product-tile"
                  onClick={() => onPick(product)}
                  className={cn(
                    'flex min-h-28 flex-col gap-1 rounded-xl border bg-card p-2.5 text-start transition-all',
                    'hover:border-primary/40 hover:shadow-sm active:scale-[0.98]',
                    out && 'opacity-55',
                  )}
                >
                  <ProductPhoto
                    productId={product.id}
                    hasPhoto={product.hasPhoto}
                    name={name}
                    className="mb-1 h-16 w-full rounded-md bg-muted object-cover text-muted-foreground [&:is(span)]:grid [&:is(span)]:place-items-center [&:is(span)]:text-base [&:is(span)]:font-semibold"
                  />
                  <span className="line-clamp-2 text-sm leading-tight font-medium">{name}</span>
                  <span className="num mt-auto text-sm font-semibold tabular-nums">
                    {formatPKR(product.pricePaisa)}
                  </span>
                  <span
                    className={cn(
                      'num text-xs tabular-nums',
                      out ? 'text-destructive' : low ? 'text-warning' : 'text-muted-foreground',
                    )}
                  >
                    {formatQty(product.stockQty)} {t(`unit.${product.unit}` as never)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'chip h-9 flex-none rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
