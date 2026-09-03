import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { useLanguage, useT, useToast } from '@/appStore';
import { Sheet } from '@/components/Dialog';
import { ProductPhoto } from '@/components/ProductPhoto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProduct } from '@/db/repos/productsRepo';
import { pickName } from '@/i18n';
import { formatPKR, formatQty, lineTotal, roundQty } from '@/lib/money';
import { cn } from '@/lib/cn';
import { FRACTIONAL_UNITS, type Product } from '@/types/domain';
import { useCart } from './cartStore';

interface AddToCartSheetProps {
  productId: number;
  onClose: () => void;
}

/** Pick a quantity, see the arithmetic, add the line — as a bottom sheet over
 *  the catalogue so the shopkeeper never leaves the till. */
export function AddToCartSheet({ productId, onClose }: AddToCartSheetProps) {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const addProduct = useCart((state) => state.addProduct);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    void getProduct(productId).then((found) => {
      setProduct(found);
      if (found && FRACTIONAL_UNITS.has(found.unit)) setQuantity(0.25);
    });
  }, [productId]);

  const step = product && FRACTIONAL_UNITS.has(product.unit) ? 0.25 : 1;
  const linePaisa = useMemo(
    () => (product ? lineTotal(product.pricePaisa, quantity) : 0),
    [product, quantity],
  );

  function change(delta: number) {
    setQuantity((current) => Math.max(step, roundQty(current + delta)));
  }

  const name = product ? pickName(language, product.nameUr, product.nameEn) : '';
  const out = product ? product.stockQty <= 0 : false;
  const low =
    product != null &&
    !out &&
    product.lowStockThreshold > 0 &&
    product.stockQty <= product.lowStockThreshold;

  return (
    <Sheet title={t('sell.productTitle')} onClose={onClose}>
      {!product ? (
        <p className="py-8 text-center text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="grid content-start gap-6 pt-2">
          <div className="flex items-center gap-4">
            <ProductPhoto
              productId={product.id}
              hasPhoto={product.hasPhoto}
              name={name}
              className="size-24 flex-none rounded-xl border bg-muted object-cover text-xl font-semibold text-muted-foreground [&:is(span)]:grid [&:is(span)]:place-items-center"
            />
            <div className="grid min-w-0 gap-1">
              <h2 className="text-lg font-semibold">{name}</h2>
              <span className="money text-2xl">{formatPKR(product.pricePaisa)}</span>
              <span
                className={cn(
                  'text-sm',
                  out ? 'text-destructive' : low ? 'text-warning' : 'text-success',
                )}
              >
                {out
                  ? t('sell.productOut')
                  : t('sell.productAvailable', {
                      qty: formatQty(product.stockQty),
                      unit: t(`unit.${product.unit}` as never),
                    })}
              </span>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">
              {t('common.qty')} · {t(`unit.${product.unit}` as never)}
            </span>
            <div className="grid grid-cols-[3.5rem_1fr_3.5rem] gap-2">
              <Button
                variant="outline"
                size="icon-lg"
                onClick={() => change(-step)}
                aria-label="Decrease quantity"
              >
                <Minus className="size-5" />
              </Button>
              <Input
                className="num h-14 text-center text-lg font-bold"
                inputMode={FRACTIONAL_UNITS.has(product.unit) ? 'decimal' : 'numeric'}
                value={String(quantity)}
                onChange={(event) => {
                  const next = roundQty(Number(event.target.value));
                  if (Number.isFinite(next) && next > 0) setQuantity(next);
                }}
                aria-label={t('common.qty')}
                data-testid="product-quantity"
              />
              <Button
                variant="outline"
                size="icon-lg"
                onClick={() => change(step)}
                aria-label="Increase quantity"
              >
                <Plus className="size-5" />
              </Button>
            </div>
            <span className="num text-sm text-muted-foreground">
              {formatPKR(product.pricePaisa)} × {formatQty(quantity)}
            </span>
          </div>

          <div className="flex items-baseline gap-3 border-t-2 border-foreground pt-4 text-lg font-semibold">
            <span className="flex-1">{t('sell.lineTotal')}</span>
            <span className="money text-2xl font-bold text-primary">{formatPKR(linePaisa)}</span>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              addProduct(product, quantity);
              toast(name);
              onClose();
            }}
            data-testid="add-product-to-cart"
          >
            {t('sell.addToCart')} · {formatPKR(linePaisa)}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
