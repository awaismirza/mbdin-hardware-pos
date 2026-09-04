import { useEffect, useState } from 'react';

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
  /** Rendered when a search matched nothing and looks like a barcode. */
  unknownBarcode?: string | null;
  onAddWithBarcode?: (barcode: string) => void;
}

export function CatalogueGrid({
  search,
  onPick,
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
        <div className="shrink-0 border-b border-line px-4 py-2.5">
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
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        >
          {/* No quick-sell tile here: the quick-action strip above already
              carries it, and two buttons with the same name is a worse grid and
              an ambiguous target. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
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
                    'flex min-h-32 flex-col gap-[7px] rounded-[13px] border border-line bg-panel p-[11px] text-start shadow-card transition-all',
                    'hover:border-brand/40 active:scale-[0.98]',
                    // Spec: an out-of-stock tile is dimmed, not hidden — it is
                    // still the answer to "do we have any?".
                    out && 'opacity-60',
                  )}
                >
                  <span className="relative block">
                    <ProductPhoto
                      productId={product.id}
                      hasPhoto={product.hasPhoto}
                      /* Spec: the well shows the Urdu name when there is no
                         photo — the label below already carries the display
                         name, so repeating it here would waste the space. */
                      name={otherName(language, product) || name}
                      className={cn(
                        'h-[52px] w-full rounded-[9px] bg-panel2 object-cover text-fg2',
                        '[&:is(span)]:grid [&:is(span)]:place-items-center [&:is(span)]:text-sm [&:is(span)]:font-semibold',
                        (out || low) && '[&:is(span)]:pe-12',
                      )}
                    />
                    {(out || low) && (
                      <span
                        className={cn(
                          'absolute end-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                          out ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
                        )}
                      >
                        {out ? t('sell.outOfStock') : t('sell.lowStock')}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-[13.5px] leading-tight font-semibold">
                    {name}
                  </span>
                  <span className="mt-auto flex items-baseline gap-1.5">
                    <span className="num text-[14.5px] font-semibold">
                      {formatPKR(product.pricePaisa)}
                    </span>
                    <span className="text-[11px] text-fg2">
                      / {t(`unit.${product.unit}` as never)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'text-[11px]',
                      out ? 'text-bad' : low ? 'text-warn' : 'text-ok',
                    )}
                  >
                    <span className="num">{formatQty(product.stockQty)}</span>{' '}
                    {t(`unit.${product.unit}` as never)}
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

/** The name in the *other* language, for the tile's image well. */
function otherName(language: string, product: Product): string {
  const value = language === 'ur' ? product.nameEn : product.nameUr;
  return value?.trim() ?? '';
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
        // Spec: selected is an inverted pill, never cobalt — the accent is
        // reserved for the one primary action on the screen.
        'chip h-[34px] flex-none rounded-full border px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
        active
          ? 'border-fg bg-fg text-bg'
          : 'border-line bg-panel text-fg2 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
