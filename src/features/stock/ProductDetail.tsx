import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useLanguage, useT, useToast } from '../../appStore';
import { Dialog } from '../../components/Dialog';
import { ProductPhoto } from '../../components/ProductPhoto';
import { getProduct, setProductActive } from '../../db/repos/productsRepo';
import { listMovements, receiveStock, stockTake } from '../../db/repos/stockRepo';
import { pickName } from '../../i18n';
import { formatDateTime } from '../../lib/dates';
import { formatPKR, formatQty, marginPercent, parsePaisa, roundQty } from '../../lib/money';
import type { Product, StockMovement } from '../../types/domain';

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
      <div className="screen">
        <div className="screen__body empty">{t('common.loading')}</div>
      </div>
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
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/stock')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title truncate">{name}</h1>
        <button
          type="button"
          className="btn"
          onClick={() => navigate(`/stock/product/${product.id}`)}
        >
          {t('action.edit')}
        </button>
      </div>

      <div className="screen__body">
        <div className="stock-detail-hero">
          <ProductPhoto
            productId={product.id}
            hasPhoto={product.hasPhoto}
            name={name}
            className="stock-detail-hero__photo"
          />
          <div>
            <span className="stock-detail-hero__label">{t('common.qty')}</span>
            <strong className="stock-detail-hero__qty num" data-testid="stock-quantity">
              {formatQty(product.stockQty)} {t(`unit.${product.unit}`)}
            </strong>
          </div>
        </div>
        <div className="kv">
          <span className="kv__key">{t('common.price')}</span>
          <span className="kv__value money">{formatPKR(product.pricePaisa)}</span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('common.cost')}</span>
          <span className="kv__value money">{formatPKR(product.costPaisa)}</span>
        </div>
        {margin !== null && (
          <div className="kv">
            <span className="kv__key">{t('stock.margin')}</span>
            <span className="kv__value num">{margin}%</span>
          </div>
        )}
        {product.barcode && (
          <div className="kv">
            <span className="kv__key">{t('common.barcode')}</span>
            <span className="kv__value num">{product.barcode}</span>
          </div>
        )}

        <div className="screen__pad row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary" onClick={() => setMode('receive')}>
            {t('stock.receive')}
          </button>
          <button type="button" className="btn" onClick={() => setMode('take')}>
            {t('stock.take')}
          </button>
          <button type="button" className="btn" onClick={() => void toggleActive()}>
            {product.isActive ? t('stock.deactivate') : t('stock.reactivate')}
          </button>
        </div>

        <div className="section-head">{t('stock.movements')}</div>
        {movements.length === 0 && <p className="screen__pad meta">{t('stock.noMovements')}</p>}
        {movements.map((movement) => (
          <div key={movement.id} className="movement">
            <span className="movement__kind">{t(`stock.movement.${movement.kind}` as never)}</span>
            <span
              className={`movement__delta ${
                movement.qtyDelta >= 0 ? 'movement__delta--in' : 'movement__delta--out'
              }`}
            >
              {movement.qtyDelta > 0 ? '+' : ''}
              {formatQty(movement.qtyDelta)}
            </span>
            <span className="movement__when">{formatDateTime(movement.createdAt)}</span>
          </div>
        ))}
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
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!valid || busy}
            onClick={() => void submit()}
          >
            {t('stock.receive')}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{t('stock.receiveQty')}</span>
          <input
            className="input num"
            inputMode="decimal"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            data-autofocus
          />
        </label>
        <label className="field">
          <span className="field__label">
            {t('stock.receiveCost', { unit: t(`unit.${product.unit}` as never) })}
          </span>
          <input
            className="input num"
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder={String(product.costPaisa / 100)}
          />
          <span className="field__hint">{t('stock.receiveCostHint')}</span>
        </label>
      </div>
    </Dialog>
  );
}

function StockTakeDialog({
  product,
  reason,
  onClose,
  onDone,
}: DialogProps & { reason: string }) {
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
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!valid || busy}
            onClick={() => void submit()}
          >
            {t('action.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{t('stock.takeCounted')}</span>
          <input
            className="input num"
            inputMode="decimal"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            data-autofocus
          />
          <span className="field__hint">
            {t('stock.takeCurrent', { qty: formatQty(product.stockQty) })}
          </span>
        </label>
        {valid && delta !== 0 && (
          <p className="meta num">
            {delta > 0 ? '+' : ''}
            {formatQty(delta)} {t(`unit.${product.unit}` as never)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
