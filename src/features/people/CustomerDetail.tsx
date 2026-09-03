import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Phone } from 'lucide-react';

import { useApp, useLanguage, useT, useToast } from '@/appStore';
import { CustomerAvatar } from '@/components/CustomerAvatar';
import { Dialog } from '@/components/Dialog';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCustomer } from '@/db/repos/customersRepo';
import { adjustBalance, listLedger, takePayment } from '@/db/repos/ledgerRepo';
import { formatDateTime } from '@/lib/dates';
import { formatPKR, parsePaisa } from '@/lib/money';
import { cn } from '@/lib/cn';
import { paymentText, reminderText, waLink } from '@/lib/whatsapp';
import {
  TENDER_METHODS,
  type CustomerWithBalance,
  type LedgerEntryWithRunning,
  type TenderMethod,
} from '@/types/domain';

type Overlay = 'none' | 'payment' | 'adjust';

export function CustomerDetail() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useApp((state) => state.settings);
  const customerId = Number(useParams()['id']);

  const [customer, setCustomer] = useState<CustomerWithBalance | null>(null);
  const [entries, setEntries] = useState<LedgerEntryWithRunning[]>([]);
  const [overlay, setOverlay] = useState<Overlay>('none');

  const refresh = useCallback(async () => {
    const [found, ledger] = await Promise.all([getCustomer(customerId), listLedger(customerId)]);
    setCustomer(found);
    setEntries(ledger);
  }, [customerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!customer) {
    return (
      <Screen title="" onBack={() => navigate('/people')}>
        <p className="p-8 text-center text-muted-foreground">{t('common.loading')}</p>
      </Screen>
    );
  }

  const shop = {
    name: settings['shop_name'] ?? '',
    phone: settings['shop_phone'] ?? '',
    footer: settings['receipt_footer'] ?? '',
  };
  const owes = customer.balancePaisa;

  function sendReminder() {
    if (!customer) return;
    if (!customer.phone) {
      toast(t('receipt.noPhone'), 'warn');
      return;
    }
    const url = waLink(
      customer.phone,
      reminderText(customer.name, customer.balancePaisa, shop, language),
    );
    if (url) window.open(url, '_blank', 'noopener');
  }

  return (
    <Screen
      title={customer.name}
      onBack={() => navigate('/people')}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/people/customer/${String(customer.id)}`)}
        >
          {t('action.edit')}
        </Button>
      }
    >
      <div className="p-4">
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <CustomerAvatar
            customerId={customer.id}
            hasPhoto={customer.hasPhoto}
            name={customer.name}
            className="size-16 flex-none"
          />
          <div className="grid gap-0.5">
            <span className="text-sm text-muted-foreground">
              {owes > 0 ? t('people.owes') : owes < 0 ? t('people.inCredit') : t('people.settled')}
            </span>
            <span
              className={cn(
                'money text-3xl font-bold',
                owes > 0 ? 'text-destructive' : 'text-success',
              )}
              data-testid="customer-balance"
            >
              {formatPKR(Math.abs(owes))}
            </span>
            {customer.creditLimitPaisa > 0 && (
              <span className="text-sm text-muted-foreground">
                {t('people.creditLimit')} {formatPKR(customer.creditLimitPaisa)}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setOverlay('payment')} data-testid="take-payment">
            {t('people.takePayment')}
          </Button>
          <Button variant="outline" onClick={sendReminder} disabled={owes <= 0}>
            {t('people.sendReminder')}
          </Button>
          {customer.phone && (
            <>
              <Button variant="outline" asChild>
                <a href={`tel:${customer.phone}`}>
                  <Phone className="size-4" /> {t('people.call')}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`sms:${customer.phone}`}>
                  <MessageSquare className="size-4" /> {t('people.sms')}
                </a>
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setOverlay('adjust')}>
            {t('people.adjust')}
          </Button>
        </div>

        <h2 className="mt-6 mb-2 text-base font-semibold">{t('people.ledger')}</h2>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('people.ledgerEmpty')}</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="ledger-row grid grid-cols-[1fr_auto_auto] items-baseline gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {t(`people.entry.${entry.kind}` as never)}
                    {entry.invoiceNo && (
                      <>
                        {' · '}
                        <span className="num">{entry.invoiceNo}</span>
                      </>
                    )}
                  </span>
                  <span className="ledger-row__when block text-xs text-muted-foreground">
                    <span className="num">{formatDateTime(entry.createdAt)}</span>
                    {entry.method ? ` · ${t(`checkout.method.${entry.method}` as never)}` : ''}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'ledger-row__amount num w-20 text-end font-semibold tabular-nums',
                    entry.amountPaisa > 0 ? 'text-destructive' : 'text-success',
                  )}
                >
                  {formatPKR(entry.amountPaisa, { signed: true, symbol: false })}
                </span>
                <span className="ledger-row__running num w-20 text-end text-muted-foreground tabular-nums">
                  {formatPKR(entry.runningPaisa, { symbol: false })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {overlay === 'payment' && (
        <PaymentDialog
          customer={customer}
          onClose={() => setOverlay('none')}
          onDone={async (paid, remaining, method) => {
            setOverlay('none');
            await refresh();
            toast(t('people.paymentTaken'));
            if (customer.phone && window.confirm(t('people.confirmWhatsapp'))) {
              const url = waLink(
                customer.phone,
                paymentText(customer.name, paid, remaining, shop, language),
              );
              if (url) window.open(url, '_blank', 'noopener');
            }
            void method;
          }}
        />
      )}

      {overlay === 'adjust' && (
        <AdjustDialog
          customerId={customer.id}
          onClose={() => setOverlay('none')}
          onDone={async () => {
            setOverlay('none');
            await refresh();
            toast(t('settings.saved'));
          }}
        />
      )}
    </Screen>
  );
}

function PaymentDialog({
  customer,
  onClose,
  onDone,
}: {
  customer: CustomerWithBalance;
  onClose: () => void;
  onDone: (paidPaisa: number, remainingPaisa: number, method: TenderMethod) => Promise<void>;
}) {
  const t = useT();
  const [amount, setAmount] = useState(
    customer.balancePaisa > 0 ? String(customer.balancePaisa / 100) : '',
  );
  const [method, setMethod] = useState<TenderMethod>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const paisa = parsePaisa(amount);
  const valid = paisa !== null && paisa > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await takePayment({
        customerId: customer.id,
        amountPaisa: paisa,
        method,
        note: note.trim() || null,
      });
      await onDone(paisa, customer.balancePaisa - paisa, method);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('people.takePayment')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            disabled={!valid || busy}
            onClick={() => void submit()}
            data-testid="confirm-payment"
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="pay-amount">{t('people.paymentAmount')}</Label>
          <Input
            id="pay-amount"
            className="num"
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">
            {t('people.owes')} {formatPKR(customer.balancePaisa)}
          </span>
        </div>

        <div className="grid gap-2">
          <Label>{t('people.paymentMethod')}</Label>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
            {TENDER_METHODS.map((entry) => (
              <Button
                key={entry}
                variant="outline"
                aria-pressed={method === entry}
                onClick={() => setMethod(entry)}
                className={cn(method === entry && 'border-foreground bg-foreground text-background')}
              >
                {t(`checkout.method.${entry}` as never)}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="pay-note">{t('common.notes')}</Label>
          <Input id="pay-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function AdjustDialog({
  customerId,
  onClose,
  onDone,
}: {
  customerId: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useT();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const paisa = parsePaisa(amount);
  const valid = paisa !== null && paisa !== 0 && note.trim() !== '';

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await adjustBalance(customerId, paisa, note.trim());
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('people.adjust')}
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
          <Label htmlFor="adj-amount">{t('common.total')}</Label>
          <Input
            id="adj-amount"
            className="num"
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">{t('people.adjustHint')}</span>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="adj-note">{t('common.notes')}</Label>
          <Input id="adj-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
