import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '../../appStore';
import { CustomerAvatar } from '../../components/CustomerAvatar';
import { Dialog } from '../../components/Dialog';
import { getCustomer } from '../../db/repos/customersRepo';
import { adjustBalance, listLedger, takePayment } from '../../db/repos/ledgerRepo';
import { formatDateTime } from '../../lib/dates';
import { formatPKR, parsePaisa } from '../../lib/money';
import { paymentText, reminderText, waLink } from '../../lib/whatsapp';
import { TENDER_METHODS, type CustomerWithBalance, type LedgerEntryWithRunning, type TenderMethod } from '../../types/domain';

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
      <div className="screen">
        <div className="screen__body empty">{t('common.loading')}</div>
      </div>
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
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/people')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title truncate">{customer.name}</h1>
        <button
          type="button"
          className="btn"
          onClick={() => navigate(`/people/customer/${String(customer.id)}`)}
        >
          {t('action.edit')}
        </button>
      </div>

      <div className="screen__body">
        <div className="customer-hero">
          <CustomerAvatar
            customerId={customer.id}
            hasPhoto={customer.hasPhoto}
            name={customer.name}
            className="customer-hero__avatar"
          />
          <div className="balance-panel">
            <span className="balance-panel__label">
              {owes > 0 ? t('people.owes') : owes < 0 ? t('people.inCredit') : t('people.settled')}
            </span>
            <span
              className={`balance-panel__value ${
                owes > 0 ? 'balance-panel__value--owes' : 'balance-panel__value--settled'
              }`}
              data-testid="customer-balance"
            >
              {formatPKR(Math.abs(owes))}
            </span>
            {customer.creditLimitPaisa > 0 && (
              <span className="balance-panel__label">
                {t('people.creditLimit')} {formatPKR(customer.creditLimitPaisa)}
              </span>
            )}
          </div>
        </div>

        <div className="person-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setOverlay('payment')}
            data-testid="take-payment"
          >
            {t('people.takePayment')}
          </button>
          <button type="button" className="btn" onClick={sendReminder} disabled={owes <= 0}>
            {t('people.sendReminder')}
          </button>
          {customer.phone && (
            <>
              <a className="btn" href={`tel:${customer.phone}`}>
                {t('people.call')}
              </a>
              <a className="btn" href={`sms:${customer.phone}`}>
                {t('people.sms')}
              </a>
            </>
          )}
          <button type="button" className="btn" onClick={() => setOverlay('adjust')}>
            {t('people.adjust')}
          </button>
        </div>

        <div className="section-head">{t('people.ledger')}</div>

        {entries.length === 0 ? (
          <p className="screen__pad meta">{t('people.ledgerEmpty')}</p>
        ) : (
          <>
            <div className="ledger-head">
              <span>{t('common.date')}</span>
              <span className="ledger-head__amount">{t('common.total')}</span>
              <span className="ledger-head__running">{t('people.running')}</span>
            </div>
            {entries.map((entry) => (
              <div key={entry.id} className="ledger-row">
                <span className="ledger-row__what">
                  <span className="ledger-row__kind">
                    {t(`people.entry.${entry.kind}` as never)}
                    {entry.invoiceNo && (
                      <>
                        {' · '}
                        <span className="num">{entry.invoiceNo}</span>
                      </>
                    )}
                  </span>
                  <br />
                  <span className="ledger-row__when">
                    <span className="num">{formatDateTime(entry.createdAt)}</span>
                    {entry.method ? ` · ${t(`checkout.method.${entry.method}` as never)}` : ''}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                </span>
                <span
                  className={`ledger-row__amount ${
                    entry.amountPaisa > 0
                      ? 'ledger-row__amount--charge'
                      : 'ledger-row__amount--payment'
                  }`}
                >
                  {formatPKR(entry.amountPaisa, { signed: true, symbol: false })}
                </span>
                <span className="ledger-row__running">
                  {formatPKR(entry.runningPaisa, { symbol: false })}
                </span>
              </div>
            ))}
          </>
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
    </div>
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
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!valid || busy}
            onClick={() => void submit()}
            data-testid="confirm-payment"
          >
            {t('action.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{t('people.paymentAmount')}</span>
          <input
            className="input num"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            data-autofocus
          />
          <span className="field__hint">
            {t('people.owes')} {formatPKR(customer.balancePaisa)}
          </span>
        </label>

        <div>
          <span className="field__label">{t('people.paymentMethod')}</span>
          <div className="methods">
            {TENDER_METHODS.map((entry) => (
              <button
                key={entry}
                type="button"
                className="btn"
                aria-pressed={method === entry}
                onClick={() => setMethod(entry)}
              >
                {t(`checkout.method.${entry}` as never)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field__label">{t('common.notes')}</span>
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
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
          <span className="field__label">{t('common.total')}</span>
          <input
            className="input num"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            data-autofocus
          />
          <span className="field__hint">{t('people.adjustHint')}</span>
        </label>
        <label className="field">
          <span className="field__label">{t('common.notes')}</span>
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}
