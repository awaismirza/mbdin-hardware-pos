import { useEffect, useState } from 'react';

import { useT } from '../../appStore';
import { Dialog } from '../../components/Dialog';
import { createCustomer, listCustomers } from '../../db/repos/customersRepo';
import { formatPKR } from '../../lib/money';
import type { CustomerWithBalance } from '../../types/domain';

interface CustomerPickerProps {
  onPick: (customerId: number | null) => void;
  onClose: () => void;
}

/**
 * Choosing or creating a customer, without leaving the sale.
 *
 * Creating asks for a name and a phone and nothing else. A shopkeeper mid-sale
 * with a queue behind the counter will not fill in an address, and a form that
 * demands one is a form that gets abandoned in favour of "Walk-in".
 */
export function CustomerPicker({ onPick, onClose }: CustomerPickerProps) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void listCustomers({ search, limit: 60 }).then((found) => {
        if (!cancelled) setCustomers(found);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createCustomer({ name, phone });
      onPick(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={t('sell.customer')} onClose={onClose}>
      {creating ? (
        <div className="stack">
          <label className="field">
            <span className="field__label">{t('common.name')}</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-autofocus
            />
          </label>
          <label className="field">
            <span className="field__label">{t('common.phone')}</span>
            <input
              className="input num"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="03001234567"
            />
          </label>
          <div className="row">
            <button type="button" className="btn grow" onClick={() => setCreating(false)}>
              {t('action.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--primary grow"
              onClick={() => void create()}
              disabled={!name.trim() || busy}
            >
              {t('action.save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <input
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('people.searchPlaceholder')}
            data-autofocus
          />

          <button type="button" className="btn btn--block" onClick={() => onPick(null)}>
            {t('common.walkIn')}
          </button>

          <div>
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="list__row"
                onClick={() => onPick(customer.id)}
              >
                <span className="list__main">
                  <span className="list__name truncate">{customer.name}</span>
                  {customer.phone && <span className="list__meta num">{customer.phone}</span>}
                </span>
                {customer.balancePaisa !== 0 && (
                  <span className="money">{formatPKR(customer.balancePaisa)}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              setName(search);
              setCreating(true);
            }}
          >
            {t('people.addCustomer')}
          </button>
        </div>
      )}
    </Dialog>
  );
}
