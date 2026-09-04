import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useLanguage, useT, useToast } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { ProductPhoto } from '@/components/ProductPhoto';
import { Screen } from '@/components/app/Screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProduct, setProductActive } from '@/db/repos/productsRepo';
import { listMovements, receiveStock, stockTake } from '@/db/repos/stockRepo';
import { pickName } from '@/i18n';
import { formatDateTime } from '@/lib/dates';
import { formatPKR, formatQty, marginPercent, parsePaisa, roundQty } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { Product, StockMovement } from '@/types/domain';

type Mode = 'none' | 'receive' | 'take';

export function ProductDetail() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const productId = Number(useParams()['id']);

  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [mode, setMode] = useState<Mode>('none');

  const refresh = useCallback(async () => {
    const [found, history] = await Promise.all([
      getProduct(productId),
      listMovements(productId, 100),
    ]);
    setProduct(found);
    setMovements(history);
  }, [productId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!product) {
    return (
      <Screen title="" onBack={() => navigate('/stock')}>
        <p className="p-8 text-center text-muted-foreground">{t('common.loading')}</p>
      </Screen>
    );
  }

  const name = pickName(language, product.nameUr, product.nameEn);
  const margin = marginPercent(product.costPaisa, product.pricePaisa);
  const lowOnStock =
    product.stockQty > 0 &&
    product.lowStockThreshold > 0 &&
    product.stockQty <= product.lowStockThreshold;
  const stockTone =
    product.stockQty <= 0 ? 'destructive' : lowOnStock ? 'warning' : 'success';

  async function toggleActive() {
    if (!product) return;
    await setProductActive(product.id, !product.isActive);
    await refresh();
  }

  return (
    <Screen
      title={name}
      onBack={() => navigate('/stock')}
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate(`/stock/product/${product.id}`)}>
          {t('action.edit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {/* Hero card: photo, name, badges, then three inset stat wells. */}
        <div className="rounded-[14px] border border-line bg-panel p-4 shadow-card">
          <div className="flex items-center gap-4">
            <ProductPhoto
              productId={product.id}
              hasPhoto={product.hasPhoto}
              name={name}
              className="size-[104px] flex-none rounded-[13px] bg-panel2 object-cover text-lg font-semibold text-fg2 [&:is(span)]:grid [&:is(span)]:place-items-center"
            />
            <div className="min-w-0">
              <div className="truncate text-xl font-extrabold tracking-tight">{name}</div>
              <div className="mb-2 text-[12.5px] text-fg2" data-testid="stock-quantity">
                <span className="num">{formatQty(product.stockQty)}</span>{' '}
                {t(`unit.${product.unit}`)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={stockTone}>
                  {product.stockQty <= 0
                    ? t('sell.outOfStock')
                    : lowOnStock
                      ? t('sell.lowStock')
                      : t('sell.inStock')}
                </Badge>
                {!product.isActive && (
                  <Badge variant="secondary">{t('stock.filter.inactive')}</Badge>
                )}
                {product.barcode && (
                  <Badge variant="secondary" className="num">
                    {product.barcode}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2.5">
            <Row label={t('common.price')} testid="kv-price">
              <span className="money">{formatPKR(product.pricePaisa)}</span>
            </Row>
            <Row label={t('common.cost')} testid="kv-cost">
              <span className="money">{formatPKR(product.costPaisa)}</span>
            </Row>
            <Row label={t('stock.margin')} tone={margin !== null ? 'ok' : undefined}>
              <span className="num">{margin === null ? '—' : `${String(margin)}%`}</span>
            </Row>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-w-[120px] flex-1" onClick={() => setMode('receive')}>
              {t('stock.receive')}
            </Button>
            <Button
              variant="outline"
              className="min-w-[120px] flex-1"
              onClick={() => setMode('take')}
            >
              {t('stock.take')}
            </Button>
            <Button
              variant="outline"
              className="min-w-[120px] flex-1"
              onClick={() => void toggleActive()}
            >
              {product.isActive ? t('stock.deactivate') : t('stock.reactivate')}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-card">
          <div className="border-b border-line px-4 py-3.5 text-[14.5px] font-bold">
            {t('stock.movements')}
          </div>
          {movements.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-fg2">{t('stock.noMovements')}</p>
          )}
          {movements.map((movement) => (
            <div
              key={movement.id}
              data-testid="movement"
              className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
            >
              <span className="w-20 flex-none text-[11.5px] font-bold text-fg2">
                {t(`stock.movement.${movement.kind}` as never)}
              </span>
              <span
                className={cn(
                  'num w-[70px] flex-none text-end text-[13.5px] font-semibold',
                  movement.qtyDelta >= 0 ? 'text-ok' : 'text-bad',
                )}
              >
                {movement.qtyDelta > 0 ? '+' : ''}
                {formatQty(movement.qtyDelta)}
              </span>
              <span className="num flex-1 text-end text-[11.5px] text-fg2">
                {formatDateTime(movement.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {mode === 'receive' && (
        <ReceiveDialog
          product={product}
          onClose={() => setMode('none')}
          onDone={async () => {
            setMode('none');
            await refresh();
            toast(t('stock.received'));
          }}
        />
      )}

      {mode === 'take' && (
        <StockTakeDialog
          product={product}
          reason={t('stock.takeReason')}
          onClose={() => setMode('none')}
          onDone={async () => {
            setMode('none');
            await refresh();
            toast(t('stock.taken'));
          }}
        />
      )}
    </Screen>
  );
}

/** One of the three inset stat wells under the product hero. */
function Row({
  label,
  testid,
  tone,
  children,
}: {
  label: string;
  testid?: string;
  tone?: 'ok';
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[11px] bg-panel2 p-[11px]">
      <dt className="mb-0.5 text-[11px] text-fg2">{label}</dt>
      <dd
        className={cn('text-[17px] font-semibold', tone === 'ok' && 'text-ok')}
        data-testid={testid}
      >
        {children}
      </dd>
    </div>
  );
}

interface DialogProps {
  product: Product;
  onClose: () => void;
  onDone: () => Promise<void>;
}

function ReceiveDialog({ product, onClose, onDone }: DialogProps) {
  const t = useT();
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  const parsedQty = roundQty(Number(qty));
  const valid = Number.isFinite(parsedQty) && parsedQty > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await receiveStock(product.id, parsedQty, cost.trim() ? parsePaisa(cost) : null);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('stock.receive')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button disabled={!valid || busy} onClick={() => void submit()}>
            {t('stock.receive')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="receive-qty">{t('stock.receiveQty')}</Label>
          <Input
            id="receive-qty"
            className="num"
            inputMode="decimal"
            autoFocus
            value={qty}
            onChange={(event) => setQty(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="receive-cost">
            {t('stock.receiveCost', { unit: t(`unit.${product.unit}` as never) })}
          </Label>
          <Input
            id="receive-cost"
            className="num"
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder={String(product.costPaisa / 100)}
          />
          <span className="text-sm text-muted-foreground">{t('stock.receiveCostHint')}</span>
        </div>
      </div>
    </Dialog>
  );
}

function StockTakeDialog({ product, reason, onClose, onDone }: DialogProps & { reason: string }) {
  const t = useT();
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = roundQty(Number(counted));
  const valid = counted.trim() !== '' && Number.isFinite(parsed);
  const delta = valid ? roundQty(parsed - product.stockQty) : 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await stockTake(product.id, parsed, reason);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('stock.take')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button disabled={!valid || busy} onClick={() => void submit()}>
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="take-counted">{t('stock.takeCounted')}</Label>
          <Input
            id="take-counted"
            className="num"
            inputMode="decimal"
            autoFocus
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">
            {t('stock.takeCurrent', { qty: formatQty(product.stockQty) })}
          </span>
        </div>
        {valid && delta !== 0 && (
          <p className="num text-sm text-muted-foreground">
            {delta > 0 ? '+' : ''}
            {formatQty(delta)} {t(`unit.${product.unit}` as never)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
