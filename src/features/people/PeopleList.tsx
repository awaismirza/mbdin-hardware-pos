import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { useT } from '@/appStore';
import { CustomerAvatar } from '@/components/CustomerAvatar';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listCustomers } from '@/db/repos/customersRepo';
import { formatPKR } from '@/lib/money';
import type { CustomerWithBalance } from '@/types/domain';

export function PeopleList() {
  const t = useT();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerWithBalance[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void listCustomers({ search }).then((found) => {
        if (!cancelled) setCustomers(found);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <Screen
      title={t('people.title')}
      scroll={false}
      actions={
        <Button size="sm" onClick={() => navigate('/people/customer/new')}>
          <Plus className="size-4" /> {t('people.addCustomer')}
        </Button>
      }
    >
      <div className="shrink-0 border-b bg-card p-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('people.searchPlaceholder')}
          aria-label={t('action.search')}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {customers === null && (
          <p className="p-8 text-center text-muted-foreground">{t('common.loading')}</p>
        )}
        {customers?.length === 0 && (
          <EmptyState
            text={search.trim() ? t('sell.noMatches') : t('people.empty')}
            action={
              search.trim() ? undefined : (
                <Button onClick={() => navigate('/people/customer/new')}>
                  {t('people.addCustomer')}
                </Button>
              )
            }
          />
        )}

        <div className="grid gap-2">
          {customers?.map((customer) => (
            <button
              key={customer.id}
              type="button"
              data-testid="customer-card"
              onClick={() => navigate(`/people/${String(customer.id)}`)}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-start transition-colors hover:border-primary/40"
            >
              <CustomerAvatar
                customerId={customer.id}
                hasPhoto={customer.hasPhoto}
                name={customer.name}
                className="size-12 flex-none"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{customer.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {customer.phone ? (
                    <span className="num">{customer.phone}</span>
                  ) : (
                    t('common.walkIn')
                  )}
                </span>
              </span>
              <span className="grid justify-items-end gap-0.5">
                {customer.balancePaisa > 0 ? (
                  <span className="money text-destructive">
                    {formatPKR(customer.balancePaisa)}
                  </span>
                ) : customer.balancePaisa < 0 ? (
                  <>
                    <span className="money text-success">
                      {formatPKR(-customer.balancePaisa)}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('people.inCredit')}</span>
                  </>
                ) : (
                  <span className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    {t('people.settled')}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Screen>
  );
}
