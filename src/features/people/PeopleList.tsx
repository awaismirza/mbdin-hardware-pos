import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { useT } from '@/appStore';
import { CustomerAvatar } from '@/components/CustomerAvatar';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/app/Screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listCustomers } from '@/db/repos/customersRepo';
import { cn } from '@/lib/cn';
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

  /*
   * Derived from the rows already on screen, not a second query. Balances are
   * always SUM(ledger_entries.amount_paisa) — nothing here caches one.
   */
  const stats = useMemo(() => {
    const rows = customers ?? [];
    return {
      owed: rows.reduce((sum, row) => sum + Math.max(0, row.balancePaisa), 0),
      owing: rows.filter((row) => row.balancePaisa > 0).length,
      settled: rows.filter((row) => row.balancePaisa <= 0).length,
    };
  }, [customers]);

  return (
    <Screen
      title={t('people.title')}
      subtitle={t('people.subtitle')}
      scroll={false}
      actions={
        <Button size="sm" onClick={() => navigate('/people/customer/new')}>
          <Plus className="size-4" /> {t('people.addCustomer')}
        </Button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <Kpi
              label={t('people.owedToYou')}
              value={formatPKR(stats.owed)}
              sub={t('people.owedSub', { count: stats.owing })}
              tone={stats.owed > 0 ? 'bad' : undefined}
            />
            <Kpi
              label={t('people.settledCount')}
              value={String(stats.settled)}
              sub={t('people.settledSub')}
              tone="ok"
            />
            <Kpi
              label={t('people.title')}
              value={String(customers?.length ?? 0)}
              sub={t('people.totalSub')}
            />
          </div>

          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('people.searchPlaceholder')}
            aria-label={t('action.search')}
          />

          {customers === null && <p className="p-8 text-center text-fg2">{t('common.loading')}</p>}
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

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {customers?.map((customer) => {
              const owes = customer.balancePaisa > 0;
              const credit = customer.balancePaisa < 0;
              return (
                <div
                  key={customer.id}
                  data-testid="customer-card"
                  className="flex flex-col gap-3 rounded-[14px] border border-line bg-panel p-3.5 shadow-card"
                >
                  <div className="flex items-center gap-2.5">
                    <CustomerAvatar
                      customerId={customer.id}
                      hasPhoto={customer.hasPhoto}
                      name={customer.name}
                      className={cn(
                        'size-[42px] flex-none',
                        owes && '[&:is(span)]:bg-bad-soft [&:is(span)]:text-bad',
                        credit && '[&:is(span)]:bg-ok-soft [&:is(span)]:text-ok',
                      )}
                    />
                    {/* The name is the tap target for the ledger as well as the
                        button below it: reaching for a person's name is what a
                        shopkeeper does, and the card itself cannot be a button
                        without nesting one inside it. */}
                    <span className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/people/${String(customer.id)}`)}
                        className="block max-w-full truncate text-start text-sm font-bold hover:text-brand"
                      >
                        {customer.name}
                      </button>
                      <span className="num block truncate text-[11.5px] text-fg2">
                        {customer.phone || t('common.walkIn')}
                      </span>
                    </span>
                    <Badge variant={owes ? 'destructive' : credit ? 'success' : 'success'}>
                      {owes ? t('people.udhaar') : credit ? t('people.inCredit') : t('people.settled')}
                    </Badge>
                  </div>

                  <div className="flex items-end gap-2.5">
                    <span className="flex-1">
                      <span className="block text-[11px] text-fg2">
                        {credit ? t('people.inCredit') : t('common.balance')}
                      </span>
                      <span
                        className={cn(
                          'money block text-[21px] leading-none font-semibold tracking-[-0.02em]',
                          owes && 'text-bad',
                          credit && 'text-ok',
                        )}
                      >
                        {formatPKR(Math.abs(customer.balancePaisa))}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/people/${String(customer.id)}`)}
                    >
                      {t('people.ledger')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Screen>
  );
}

/** KPI card, same shape as Reports — label in caps, mono figure, context. */
function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="rounded-[14px] border border-line bg-panel p-[15px] shadow-card">
      <div className="label-caps mb-2">{label}</div>
      <div
        className={cn(
          'money text-[23px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap',
          tone === 'ok' && 'text-ok',
          tone === 'bad' && 'text-bad',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-fg2">{sub}</div>
    </div>
  );
}
