import { useState } from 'react';

import { useT } from '../../appStore';
import { Dialog } from '../../components/Dialog';
import { NumberPad } from '../../components/NumberPad';
import { formatPKR, formatQty, lineTotal, parsePaisa } from '../../lib/money';
import { FRACTIONAL_UNITS, type CartLine } from '../../types/domain';
import { useCart, type DiscountMode } from './cartStore';

interface CartPaneProps {
  customerLabel: string;
  onPickCustomer: () => void;
  onCheckout: () => void;
  onHold: () => void;
}

export function CartPane({ customerLabel, onPickCustomer, onCheckout, onHold }: CartPaneProps) {
  const t = useT();
  const lines = useCart((state) => state.lines);
  const subtotal = useCart((state) => state.subtotalPaisa());
  const discount = useCart((state) => state.discountPaisa());
  const total = useCart((state) => state.totalPaisa());

  const [editingQty, setEditingQty] = useState<CartLine | null>(null);
  const [editingPrice, setEditingPrice] = useState<CartLine | null>(null);
  const [editingDiscount, setEditingDiscount] = useState(false);

  return (
    <div className="cart">
      <div className="cart__customer">
        <span className="meta">{t('sell.customer')}</span>
        <button type="button" className="btn btn--quiet grow" onClick={onPickCustomer}>
          <span className="truncate">{customerLabel}</span>
        </button>
      </div>

      <div className="cart__lines">
        {lines.length === 0 && <p className="empty">{t('sell.cartEmpty')}</p>}
        {lines.map((line) => (
          <CartRow
            key={line.key}
            line={line}
            onEditQty={() => setEditingQty(line)}
            onEditPrice={() => setEditingPrice(line)}
          />
        ))}
      </div>

      <div className="cart__foot">
        <div className="cart__row">
          <span className="cart__row-label">{t('common.subtotal')}</span>
          <span className="cart__row-value num">{formatPKR(subtotal)}</span>
        </div>

        <button type="button" className="cart__row" onClick={() => setEditingDiscount(true)}>
          <span className="cart__row-label">{t('common.discount')}</span>
          <span className="cart__row-value num">
            {discount === 0 ? '—' : `- ${formatPKR(discount)}`}
          </span>
        </button>

        <div className="cart__total">
          <span className="cart__total-label">{t('common.total')}</span>
          <span className="money money--total" data-testid="cart-total">
            {formatPKR(total)}
          </span>
        </div>

        <div className="cart__actions">
          <button
            type="button"
            className="btn"
            onClick={onHold}
            disabled={lines.length === 0}
          >
            {t('sell.hold')}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={onCheckout}
            disabled={lines.length === 0}
            data-testid="charge"
          >
            {t('sell.charge')}
          </button>
        </div>
      </div>

      {editingQty && <QtyDialog line={editingQty} onClose={() => setEditingQty(null)} />}
      {editingPrice && <PriceDialog line={editingPrice} onClose={() => setEditingPrice(null)} />}
      {editingDiscount && <DiscountDialog onClose={() => setEditingDiscount(false)} />}
    </div>
  );
}

function CartRow({
  line,
  onEditQty,
  onEditPrice,
}: {
  line: CartLine;
  onEditQty: () => void;
  onEditPrice: () => void;
}) {
  const t = useT();
  const bumpQty = useCart((state) => state.bumpQty);
  const removeLine = useCart((state) => state.removeLine);

  return (
    <div className="cart-line">
      <div className="cart-line__top">
        <span className="cart-line__name truncate">{line.name}</span>
        <button type="button" className="cart-line__unit btn btn--quiet" onClick={onEditPrice}>
          {formatPKR(line.pricePaisa)} / {t(`unit.${line.unit}` as never)}
        </button>
      </div>

      <div className="cart-line__bottom">
        <div className="stepper">
          <button
            type="button"
            className="stepper__btn"
            onClick={() => bumpQty(line.key, -stepFor(line))}
            aria-label="−"
          >
            −
          </button>
          <button type="button" className="stepper__value" onClick={onEditQty}>
            {formatQty(line.qty)}
          </button>
          <button
            type="button"
            className="stepper__btn"
            onClick={() => bumpQty(line.key, stepFor(line))}
            aria-label="+"
          >
            +
          </button>
        </div>

        <span className="cart-line__total">{formatPKR(lineTotal(line.pricePaisa, line.qty))}</span>

        <button
          type="button"
          className="cart-line__remove"
          onClick={() => removeLine(line.key)}
          aria-label={t('action.remove')}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Weighed goods step by a quarter; counted goods step by one. */
function stepFor(line: CartLine): number {
  return FRACTIONAL_UNITS.has(line.unit) ? 0.25 : 1;
}

function QtyDialog({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const t = useT();
  const setQty = useCart((state) => state.setQty);

  return (
    <Dialog title={line.name} onClose={onClose}>
      <NumberPad
        initial={formatQty(line.qty)}
        allowDecimal={FRACTIONAL_UNITS.has(line.unit)}
        label={`${t('common.qty')} (${t(`unit.${line.unit}` as never)})`}
        confirmLabel={t('action.done')}
        onCancel={onClose}
        onConfirm={(value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) setQty(line.key, parsed);
          onClose();
        }}
      />
    </Dialog>
  );
}

function PriceDialog({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const t = useT();
  const setPrice = useCart((state) => state.setPrice);

  return (
    <Dialog title={t('sell.priceOverride')} onClose={onClose}>
      <p className="meta" style={{ marginBlockEnd: 'var(--s3)' }}>
        {t('sell.priceOverrideHint')}
      </p>
      <NumberPad
        initial={String(line.pricePaisa / 100)}
        label={line.name}
        confirmLabel={t('action.apply')}
        onCancel={onClose}
        onConfirm={(value) => {
          const paisa = parsePaisa(value);
          if (paisa !== null && paisa >= 0) setPrice(line.key, paisa);
          onClose();
        }}
      />
    </Dialog>
  );
}

function DiscountDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const mode = useCart((state) => state.discountMode);
  const input = useCart((state) => state.discountInput);
  const setDiscount = useCart((state) => state.setDiscount);
  const [pending, setPending] = useState<DiscountMode>(mode);

  return (
    <Dialog title={t('common.discount')} onClose={onClose}>
      <div className="segmented" style={{ marginBlockEnd: 'var(--s3)' }}>
        <button
          type="button"
          className="segmented__item"
          aria-pressed={pending === 'rupees'}
          onClick={() => setPending('rupees')}
        >
          {t('common.rupees')}
        </button>
        <button
          type="button"
          className="segmented__item"
          aria-pressed={pending === 'percent'}
          onClick={() => setPending('percent')}
        >
          {t('common.percent')}
        </button>
      </div>

      <NumberPad
        initial={
          mode === pending ? String(pending === 'percent' ? input : input / 100) : ''
        }
        confirmLabel={t('action.apply')}
        onCancel={onClose}
        onConfirm={(value) => {
          if (pending === 'percent') {
            const percent = Number(value);
            setDiscount('percent', Number.isFinite(percent) ? percent : 0);
          } else {
            setDiscount('rupees', parsePaisa(value) ?? 0);
          }
          onClose();
        }}
      />
    </Dialog>
  );
}
