import { useEffect, useState } from 'react';

import { useT } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCustomer, listCustomers } from '@/db/repos/customersRepo';
import { formatPKR } from '@/lib/money';
import type { CustomerWithBalance } from '@/types/domain';

interface CustomerPickerProps {
  onPick: (customerId: number | null) => void;
  onClose: () => void;
}

/** Choosing or creating a customer without leaving the sale. */
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
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="picker-name">{t('common.name')}</Label>
            <Input
              id="picker-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="picker-phone">{t('common.phone')}</Label>
            <Input
              id="picker-phone"
              className="num"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="03001234567"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCreating(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={() => void create()}
              disabled={!name.trim() || busy}
            >
              {t('action.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <Input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('people.searchPlaceholder')}
          />

          <Button variant="outline" className="w-full" onClick={() => onPick(null)}>
            {t('common.walkIn')}
          </Button>

          <div className="max-h-64 divide-y overflow-y-auto">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => onPick(customer.id)}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-start hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{customer.name}</span>
                  {customer.phone && (
                    <span className="num block text-sm text-muted-foreground">{customer.phone}</span>
                  )}
                </span>
                {customer.balancePaisa !== 0 && (
                  <span className="money text-sm">{formatPKR(customer.balancePaisa)}</span>
                )}
              </button>
            ))}
          </div>

          <Button
            className="w-full"
            onClick={() => {
              setName(search);
              setCreating(true);
            }}
          >
            {t('people.addCustomer')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
