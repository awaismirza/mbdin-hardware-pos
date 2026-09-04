import { useEffect, useState } from 'react';

import { useT } from '@/appStore';
import { Dialog, Sheet } from '@/components/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCustomer } from '@/db/repos/customersRepo';
import { formatPKR, parsePaisa, TENDER_DENOMINATIONS } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { CustomerWithBalance, PaymentMethod } from '@/types/domain';

interface CheckoutSheetProps {
  totalPaisa: number;
  customerId: number | null;
  onPickCustomer: () => void;
  onConfirm: (result: { paidPaisa: number; method: PaymentMethod; note: string | null }) => void;
  onClose: () => void;
  busy: boolean;
}

const METHODS: readonly { key: PaymentMethod; label: `checkout.method.${string}` }[] = [
  { key: 'cash', label: 'checkout.method.cash' },
  { key: 'credit', label: 'checkout.method.credit' },
  { key: 'easypaisa', label: 'checkout.method.easypaisa' },
  { key: 'jazzcash', label: 'checkout.method.jazzcash' },
  { key: 'bank', label: 'checkout.method.bank' },
] as const;

export function CheckoutSheet({
  totalPaisa,
  customerId,
  onPickCustomer,
  onConfirm,
  onClose,
  busy,
}: CheckoutSheetProps) {
  const t = useT();

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [partial, setPartial] = useState('');
  const [note, setNote] = useState('');
  const [customer, setCustomer] = useState<CustomerWithBalance | null>(null);
  const [overLimit, setOverLimit] = useState(false);

  useEffect(() => {
    if (customerId === null) {
      setCustomer(null);
      return;
    }
    void getCustomer(customerId).then(setCustomer);
  }, [customerId]);

  const isCredit = method === 'credit';
  const tenderedPaisa = parsePaisa(tendered) ?? 0;
  const partialPaisa = parsePaisa(partial);

  const paidPaisa = isCredit ? Math.min(Math.max(partialPaisa ?? 0, 0), totalPaisa) : totalPaisa;
  const duePaisa = totalPaisa - paidPaisa;
  const changePaisa = Math.max(0, tenderedPaisa - totalPaisa);

  const needsCustomer = duePaisa > 0 && customerId === null;
  const canConfirm = !busy && !needsCustomer;

  async function submit() {
    if (!canConfirm) return;

    if (duePaisa > 0 && customerId !== null && !overLimit) {
      const latest = customer?.id === customerId ? customer : await getCustomer(customerId);
      if (latest) {
        setCustomer(latest);
        if (
          latest.creditLimitPaisa > 0 &&
          latest.balancePaisa + duePaisa > latest.creditLimitPaisa
        ) {
          setOverLimit(true);
          return;
        }
      }
    }

    onConfirm({
      paidPaisa,
      method: resolveMethod(method, paidPaisa, totalPaisa),
      note: note.trim() || null,
    });
  }

  return (
    <Sheet title={t('checkout.title')} onClose={onClose}>
      <div className="grid gap-4">
        <div className="flex items-end gap-2.5 border-b border-dashed border-line pb-3">
          <span className="flex-1 text-[13px] text-fg2">{t('common.total')}</span>
          <span className="money text-[38px] leading-none font-semibold tracking-[-0.03em]">
            {formatPKR(totalPaisa)}
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
          {METHODS.map((entry) => (
            <Button
              key={entry.key}
              variant="outline"
              aria-pressed={method === entry.key}
              onClick={() => setMethod(entry.key)}
              data-testid={`method-${entry.key}`}
              className={cn(
                'min-h-[52px] border-[1.5px]',
                method === entry.key
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line',
              )}
            >
              {t(entry.label as never)}
            </Button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="num" onClick={() => setTendered(String(totalPaisa / 100))}>
                {t('checkout.exact')}
              </Button>
              {TENDER_DENOMINATIONS.map((paisa) => (
                <Button
                  key={paisa}
                  variant="outline"
                  className="num"
                  onClick={() =>
                    setTendered((current) => String(((parsePaisa(current) ?? 0) + paisa) / 100))
                  }
                >
                  {formatPKR(paisa, { symbol: false })}
                </Button>
              ))}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tendered">{t('checkout.tendered')}</Label>
              <Input
                id="tendered"
                className="num"
                inputMode="decimal"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
              />
            </div>

            <div className="flex items-end gap-2.5 rounded-xl bg-ok-soft p-3 text-ok">
              <span className="flex-1 text-[13px] font-semibold">{t('checkout.change')}</span>
              <span
                className="money text-[30px] leading-none font-semibold tracking-[-0.03em]"
                data-testid="change-due"
              >
                {formatPKR(changePaisa)}
              </span>
            </div>
          </div>
        )}

        {isCredit && (
          <div className="grid gap-3">
            <Button variant="outline" className="w-full" onClick={onPickCustomer}>
              {customer ? customer.name : t('sell.customer')}
            </Button>

            {needsCustomer && (
              <p className="rounded-xl bg-warn-soft p-3 text-[12.5px] font-semibold text-warn">
                {t('checkout.needCustomer')}
              </p>
            )}

            {customer && customer.balancePaisa !== 0 && (
              <div className="flex items-baseline gap-3 text-sm">
                <span className="flex-1 text-muted-foreground">{t('people.owes')}</span>
                <span className="money">{formatPKR(customer.balancePaisa)}</span>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="amount-paid">{t('checkout.amountPaid')}</Label>
              <Input
                id="amount-paid"
                className="num"
                inputMode="decimal"
                value={partial}
                onChange={(event) => setPartial(event.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex items-end gap-2.5 rounded-xl bg-bad-soft p-3 text-bad">
              <span className="flex-1 text-[13px] font-semibold">{t('checkout.remainder')}</span>
              <span
                className="money text-[30px] leading-none font-semibold tracking-[-0.03em]"
                data-testid="udhaar-due"
              >
                {formatPKR(duePaisa)}
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="sale-note">{t('checkout.note')}</Label>
          <Input id="sale-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>

        <Button
          size="lg"
          className="h-[54px] w-full text-[15.5px]"
          onClick={() => void submit()}
          disabled={!canConfirm}
          data-testid="confirm-sale"
        >
          {t('checkout.confirm')}
        </Button>
      </div>

      {overLimit && customer && (
        <Dialog
          title={t('checkout.overLimit')}
          onClose={() => setOverLimit(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setOverLimit(false)}>
                {t('action.cancel')}
              </Button>
              <Button
                data-testid="charge-anyway"
                onClick={() =>
                  onConfirm({
                    paidPaisa,
                    method: resolveMethod(method, paidPaisa, totalPaisa),
                    note: note.trim() || null,
                  })
                }
              >
                {t('checkout.chargeAnyway')}
              </Button>
            </>
          }
        >
          <p>
            {t('checkout.overLimitBody', {
              name: customer.name,
              balance: formatPKR(customer.balancePaisa),
              after: formatPKR(customer.balancePaisa + duePaisa),
              limit: formatPKR(customer.creditLimitPaisa),
            })}
          </p>
        </Dialog>
      )}
    </Sheet>
  );
}

function resolveMethod(
  method: PaymentMethod,
  paidPaisa: number,
  totalPaisa: number,
): PaymentMethod {
  if (method !== 'credit') return method;
  if (paidPaisa <= 0) return 'credit';
  if (paidPaisa >= totalPaisa) return 'cash';
  return 'mixed';
}
