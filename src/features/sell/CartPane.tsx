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
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <button
        type="button"
        onClick={onPickCustomer}
        className="flex min-h-12 shrink-0 items-center gap-2 border-b px-4 py-2 text-start hover:bg-accent"
      >
        <span className="text-xs text-muted-foreground">{t('sell.customer')}</span>
        <span className="truncate font-medium">{customerLabel}</span>
      </button>

      <div className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain">
        {lines.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('sell.cartEmpty')}</p>
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

      <div className="shrink-0 border-t px-4 py-3">
        <div className="flex items-baseline gap-3 text-sm">
          <span className="flex-1 text-muted-foreground">{t('common.subtotal')}</span>
          <span className="num tabular-nums">{formatPKR(subtotal)}</span>
        </div>

        <button
          type="button"
          onClick={() => setEditingDiscount(true)}
          className="flex min-h-11 w-full items-center gap-3 text-start text-sm"
        >
          <span className="flex-1 text-muted-foreground">{t('common.discount')}</span>
          <span className="num tabular-nums">
            {discount === 0 ? '—' : `- ${formatPKR(discount)}`}
          </span>
        </button>

        <div className="mt-1 flex items-baseline gap-3 border-t-2 border-foreground pt-2">
          <span className="flex-1 text-lg font-semibold">{t('common.total')}</span>
          <span className="money text-2xl font-bold text-primary" data-testid="cart-total">
            {formatPKR(total)}
          </span>
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onHold} disabled={lines.length === 0}>
            {t('sell.hold')}
          </Button>
          <Button
            size="lg"
            className="flex-[2]"
            onClick={onCheckout}
            disabled={lines.length === 0}
            data-testid="charge"
          >
            {t('sell.charge')}
          </Button>
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
    <div className="grid gap-2 px-4 py-3" data-testid="cart-line">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate">{line.name}</span>
        <button
          type="button"
          onClick={onEditPrice}
          className="num text-xs text-muted-foreground tabular-nums underline-offset-2 hover:underline"
        >
          {formatPKR(line.pricePaisa)} / {t(`unit.${line.unit}` as never)}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border">
          <button
            type="button"
            className="grid size-11 place-items-center bg-muted/50 active:bg-muted"
            onClick={() => bumpQty(line.key, -stepFor(line))}
            aria-label="−"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={onEditQty}
            className="num grid h-11 min-w-16 place-items-center border-x px-2 font-semibold tabular-nums"
          >
            {formatQty(line.qty)}
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center bg-muted/50 active:bg-muted"
            onClick={() => bumpQty(line.key, stepFor(line))}
            aria-label="+"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <span className="num flex-1 text-end font-semibold tabular-nums">
          {formatPKR(lineTotal(line.pricePaisa, line.qty))}
        </span>

        <button
          type="button"
          onClick={() => removeLine(line.key)}
          aria-label={t('action.remove')}
          className="grid size-11 place-items-center text-muted-foreground hover:text-destructive"
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
  const mode = useCart((state) => state.discountMode);
  const input = useCart((state) => state.discountInput);
  const setDiscount = useCart((state) => state.setDiscount);
  const [pending, setPending] = useState<DiscountMode>(mode);

  return (
    <Dialog title={t('common.discount')} onClose={onClose}>
      <div className="mb-3 inline-flex rounded-lg border p-1">
        {(['rupees', 'percent'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={pending === m}
            onClick={() => setPending(m)}
            className={cn(
              'min-w-24 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              pending === m
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
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
