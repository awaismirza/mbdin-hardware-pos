import { useEffect, useState } from 'react';

import { useT } from '../../appStore';
import { Dialog, Sheet } from '../../components/Dialog';
import { getCustomer } from '../../db/repos/customersRepo';
import { formatPKR, parsePaisa, TENDER_DENOMINATIONS } from '../../lib/money';
import type { CustomerWithBalance, PaymentMethod } from '../../types/domain';

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

  // On udhaar, anything entered as a part payment is taken now and the rest
  // becomes a charge. On any other method the sale is paid in full.
  const paidPaisa = isCredit ? Math.min(Math.max(partialPaisa ?? 0, 0), totalPaisa) : totalPaisa;
  const duePaisa = totalPaisa - paidPaisa;
  const changePaisa = Math.max(0, tenderedPaisa - totalPaisa);

  const needsCustomer = duePaisa > 0 && customerId === null;
  const canConfirm = !busy && !needsCustomer;

  function submit() {
    if (!canConfirm) return;

    // Warn, never block. The shopkeeper knows who is good for it and the app
    // does not — but they should see the numbers before deciding.
    if (
      duePaisa > 0 &&
      customer &&
      customer.creditLimitPaisa > 0 &&
      customer.balancePaisa + duePaisa > customer.creditLimitPaisa &&
      !overLimit
    ) {
      setOverLimit(true);
      return;
    }

    onConfirm({
      paidPaisa,
      method: resolveMethod(method, paidPaisa, totalPaisa),
      note: note.trim() || null,
    });
  }

  return (
    <Sheet title={t('checkout.title')} onClose={onClose}>
      <div className="stack">
        <div className="cart__total">
          <span className="cart__total-label">{t('common.total')}</span>
          <span className="money money--total">{formatPKR(totalPaisa)}</span>
        </div>

        <div className="methods">
          {METHODS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="btn"
              aria-pressed={method === entry.key}
              onClick={() => setMethod(entry.key)}
              data-testid={`method-${entry.key}`}
            >
              {t(entry.label as never)}
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="stack">
            <div className="numpad__quick">
              <button
                type="button"
                className="btn num"
                onClick={() => setTendered(String(totalPaisa / 100))}
              >
                {t('checkout.exact')}
              </button>
              {TENDER_DENOMINATIONS.map((paisa) => (
                <button
                  key={paisa}
                  type="button"
                  className="btn num"
                  onClick={() =>
                    setTendered((current) =>
                      String(((parsePaisa(current) ?? 0) + paisa) / 100),
                    )
                  }
                >
                  {formatPKR(paisa, { symbol: false })}
                </button>
              ))}
            </div>

            <label className="field">
              <span className="field__label">{t('checkout.tendered')}</span>
              <input
                className="input num"
                inputMode="decimal"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
              />
            </label>

            <div className="checkout__due">
              <span className="checkout__due-label">{t('checkout.change')}</span>
              <span className="money money--total" data-testid="change-due">
                {formatPKR(changePaisa)}
              </span>
            </div>
          </div>
        )}

        {isCredit && (
          <div className="stack">
            <button type="button" className="btn btn--block" onClick={onPickCustomer}>
              {customer ? customer.name : t('sell.customer')}
            </button>

            {needsCustomer && <p className="field__error">{t('checkout.needCustomer')}</p>}

            {customer && customer.balancePaisa !== 0 && (
              <div className="kv" style={{ paddingInline: 0 }}>
                <span className="kv__key">{t('people.owes')}</span>
                <span className="kv__value money">{formatPKR(customer.balancePaisa)}</span>
              </div>
            )}

            <label className="field">
              <span className="field__label">{t('checkout.amountPaid')}</span>
              <input
                className="input num"
                inputMode="decimal"
                value={partial}
                onChange={(event) => setPartial(event.target.value)}
                placeholder="0"
              />
            </label>

            <div className="checkout__due">
              <span className="checkout__due-label">{t('checkout.remainder')}</span>
              <span className="money money--total" data-testid="udhaar-due">
                {formatPKR(duePaisa)}
              </span>
            </div>
          </div>
        )}

        <label className="field">
          <span className="field__label">{t('checkout.note')}</span>
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={submit}
          disabled={!canConfirm}
          data-testid="confirm-sale"
        >
          {t('checkout.confirm')}
        </button>
      </div>

      {overLimit && customer && (
        <Dialog
          title={t('checkout.overLimit')}
          onClose={() => setOverLimit(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setOverLimit(false)}>
                {t('action.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
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
              </button>
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

/**
 * A part-paid credit sale is 'mixed': some money came in and some went on the
 * book. Recording it as 'credit' would make the day's cash figure wrong.
 */
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
