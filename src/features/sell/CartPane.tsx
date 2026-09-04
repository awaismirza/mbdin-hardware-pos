import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

import { useT } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { NumberPad } from '@/components/NumberPad';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatPKR, formatQty, lineTotal, parsePaisa } from '@/lib/money';
import { FRACTIONAL_UNITS, type CartLine } from '@/types/domain';
import { useCart, type DiscountMode } from './cartStore';

interface CartPaneProps {
  customerLabel: string;
  onPickCustomer: () => void;
  onCheckout: () => void;
}

/** Stable reference for "no cart yet" — a fresh `[]` in the selector loops. */
const NO_LINES: CartLine[] = [];

export function CartPane({ customerLabel, onPickCustomer, onCheckout }: CartPaneProps) {
  const t = useT();
  // Select the cart (a stable reference), derive lines outside the selector.
  const cart = useCart((state) => state.current());
  const lines = cart?.lines ?? NO_LINES;
  const subtotal = useCart((state) => state.subtotalPaisa());
  const discount = useCart((state) => state.discountPaisa());
  const total = useCart((state) => state.totalPaisa());

  const [editingQty, setEditingQty] = useState<CartLine | null>(null);
  const [editingPrice, setEditingPrice] = useState<CartLine | null>(null);
  const [editingDiscount, setEditingDiscount] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex min-h-12 shrink-0 items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span className="grid size-[34px] flex-none place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand">
          {customerLabel.trim().charAt(0).toUpperCase() || '—'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold">{customerLabel}</span>
          <span className="block text-xs text-fg2">{t('sell.customer')}</span>
        </span>
        <Button variant="outline" size="sm" onClick={onPickCustomer}>
          {t('action.change')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2.5">
        {lines.length === 0 && (
          <p className="m-auto px-4 py-6 text-center text-[13px] text-fg2">{t('sell.cartEmpty')}</p>
        )}
        {lines.map((line) => (
          <CartRow
            key={line.key}
            line={line}
            onEditQty={() => setEditingQty(line)}
            onEditPrice={() => setEditingPrice(line)}
          />
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-[7px] border-t border-line px-4 py-3">
        <div className="flex items-baseline gap-2.5 text-[12.5px]">
          <span className="flex-1 text-fg2">{t('common.subtotal')}</span>
          <span className="num text-[13.5px]">{formatPKR(subtotal)}</span>
        </div>

        <button
          type="button"
          onClick={() => setEditingDiscount(true)}
          className="flex min-h-9 items-center gap-2.5 text-start text-[12.5px]"
        >
          <span className="flex-1 text-fg2">
            {t('common.discount')} <span className="font-bold text-brand">{t('action.edit')}</span>
          </span>
          <span className={cn('num text-[13.5px]', discount > 0 && 'text-ok')}>
            {discount === 0 ? '—' : `- ${formatPKR(discount)}`}
          </span>
        </button>

        <div className="flex items-end gap-2.5 border-t border-dashed border-line pt-[9px]">
          <span className="flex-1 text-[13.5px] font-bold">{t('common.total')}</span>
          <span
            className="money text-[34px] leading-none font-semibold tracking-[-0.03em]"
            data-testid="cart-total"
          >
            {formatPKR(total)}
          </span>
        </div>

        <Button
          className="mt-1 h-[46px] w-full text-[14.5px]"
          onClick={onCheckout}
          disabled={lines.length === 0}
          data-testid="charge"
        >
          {t('sell.charge')}
        </Button>
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
    <div
      className="animate-line-in rounded-xl border border-line bg-panel2 p-[11px]"
      data-testid="cart-line"
    >
      <div className="mb-[9px] flex items-baseline gap-2.5">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{line.name}</span>
        <button
          type="button"
          onClick={onEditPrice}
          className="num text-[11.5px] text-fg2 underline-offset-2 hover:underline"
        >
          {formatPKR(line.pricePaisa)} / {t(`unit.${line.unit}` as never)}
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Spec: one bordered group with a divided centre value — the three
            parts are never spaced apart. */}
        <div className="flex items-center overflow-hidden rounded-[10px] border border-line bg-panel">
          <button
            type="button"
            className="grid size-11 place-items-center text-fg2 active:bg-panel2"
            onClick={() => bumpQty(line.key, -stepFor(line))}
            aria-label="−"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={onEditQty}
            className="num grid h-11 min-w-[46px] place-items-center border-x border-line px-2 text-sm font-semibold"
          >
            {formatQty(line.qty)}
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center text-fg2 active:bg-panel2"
            onClick={() => bumpQty(line.key, stepFor(line))}
            aria-label="+"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <span className="num flex-1 text-end text-[14.5px] font-semibold">
          {formatPKR(lineTotal(line.pricePaisa, line.qty))}
        </span>

        <button
          type="button"
          onClick={() => removeLine(line.key)}
          aria-label={t('action.remove')}
          className="grid size-9 place-items-center rounded-[9px] text-fg2 hover:text-bad"
        >
          <X className="size-4" />
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
      <p className="mb-3 text-sm text-muted-foreground">{t('sell.priceOverrideHint')}</p>
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
  const mode = useCart((state) => state.current()?.discountMode ?? 'rupees');
  const input = useCart((state) => state.current()?.discountInput ?? 0);
  const setDiscount = useCart((state) => state.setDiscount);
  const [pending, setPending] = useState<DiscountMode>(mode);

  return (
    <Dialog title={t('common.discount')} onClose={onClose}>
      <div className="mb-3 inline-flex rounded-xl border border-line bg-panel2 p-1">
        {(['rupees', 'percent'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={pending === m}
            onClick={() => setPending(m)}
            className={cn(
              'min-w-24 rounded-[9px] px-4 py-2 text-sm font-semibold transition-colors',
              pending === m ? 'bg-fg text-bg' : 'text-fg2 hover:text-fg',
            )}
          >
            {m === 'rupees' ? t('common.rupees') : t('common.percent')}
          </button>
        ))}
      </div>

      <NumberPad
        initial={mode === pending ? String(pending === 'percent' ? input : input / 100) : ''}
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
