import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useLanguage, useT, useToast } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { ProductPhoto } from '@/components/ProductPhoto';
import { Screen } from '@/components/app/Screen';
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
      <div className="p-4">
        <div className="flex items-center gap-4">
          <ProductPhoto
            productId={product.id}
            hasPhoto={product.hasPhoto}
            name={name}
            className="size-28 flex-none rounded-xl border bg-muted object-cover text-xl font-semibold text-muted-foreground [&:is(span)]:grid [&:is(span)]:place-items-center"
          />
          <div>
            <span className="block text-sm text-muted-foreground">{t('common.qty')}</span>
            <strong className="num block text-lg" data-testid="stock-quantity">
              {formatQty(product.stockQty)} {t(`unit.${product.unit}`)}
            </strong>
          </div>
        </div>

        <dl className="mt-4 divide-y rounded-xl border">
          <Row label={t('common.price')} testid="kv-price">
            <span className="money">{formatPKR(product.pricePaisa)}</span>
          </Row>
          <Row label={t('common.cost')} testid="kv-cost">
            <span className="money">{formatPKR(product.costPaisa)}</span>
          </Row>
          {margin !== null && (
            <Row label={t('stock.margin')}>
              <span className="num">{margin}%</span>
            </Row>
          )}
          {product.barcode && (
            <Row label={t('common.barcode')}>
              <span className="num">{product.barcode}</span>
            </Row>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setMode('receive')}>{t('stock.receive')}</Button>
          <Button variant="outline" onClick={() => setMode('take')}>
            {t('stock.take')}
          </Button>
          <Button variant="outline" onClick={() => void toggleActive()}>
            {product.isActive ? t('stock.deactivate') : t('stock.reactivate')}
          </Button>
        </div>

        <h2 className="mt-6 mb-2 text-base font-semibold">{t('stock.movements')}</h2>
        {movements.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('stock.noMovements')}</p>
        )}
        <div className="divide-y rounded-xl border">
          {movements.map((movement) => (
            <div
              key={movement.id}
              data-testid="movement"
              className="flex items-baseline gap-3 px-4 py-3 text-sm"
            >
              <span className="w-20 flex-none text-muted-foreground">
                {t(`stock.movement.${movement.kind}` as never)}
              </span>
              <span
                className={cn(
                  'num w-16 text-end font-semibold tabular-nums',
                  movement.qtyDelta >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {movement.qtyDelta > 0 ? '+' : ''}
                {formatQty(movement.qtyDelta)}
              </span>
              <span className="num flex-1 text-end text-muted-foreground">
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

function Row({
  label,
  testid,
  children,
}: {
  label: string;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-3">
      <dt className="flex-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end" data-testid={testid}>
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
