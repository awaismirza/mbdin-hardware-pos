import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useT } from '../../appStore';
import { CustomerAvatar } from '../../components/CustomerAvatar';
import { EmptyState } from '../../components/EmptyState';
import { listCustomers } from '../../db/repos/customersRepo';
import { formatPKR } from '../../lib/money';
import type { CustomerWithBalance } from '../../types/domain';

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
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('people.title')}</h1>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => navigate('/people/customer/new')}
        >
          {t('people.addCustomer')}
        </button>
      </div>

      <div className="customer-toolbar">
        <input
          className="input grow"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('people.searchPlaceholder')}
          aria-label={t('action.search')}
        />
      </div>

      <div className="screen__body customer-list">
        {customers === null && <div className="empty">{t('common.loading')}</div>}
        {customers?.length === 0 && (
          <EmptyState
            text={search.trim() ? t('sell.noMatches') : t('people.empty')}
            action={
              search.trim() ? undefined : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate('/people/customer/new')}
                >
                  {t('people.addCustomer')}
                </button>
              )
            }
          />
        )}

        {customers?.map((customer) => (
          <button
            key={customer.id}
            type="button"
            className="customer-card list__row"
            onClick={() => navigate(`/people/${String(customer.id)}`)}
          >
            <CustomerAvatar
              customerId={customer.id}
              hasPhoto={customer.hasPhoto}
              name={customer.name}
              className="customer-card__avatar"
            />
            <span className="list__main">
              <span className="list__name truncate">{customer.name}</span>
              <span className="customer-card__meta">
                {customer.phone ? <span className="num">{customer.phone}</span> : t('common.walkIn')}
              </span>
            </span>
            <span className="person-row__balance">
              {customer.balancePaisa > 0 ? (
                <span className="money" style={{ color: 'var(--seal)' }}>
                  {formatPKR(customer.balancePaisa)}
                </span>
              ) : customer.balancePaisa < 0 ? (
                <span className="money" style={{ color: 'var(--settled)' }}>
                  {formatPKR(-customer.balancePaisa)}
                </span>
              ) : (
                <span className="tag tag--ok">{t('people.settled')}</span>
              )}
              {customer.balancePaisa < 0 && (
                <span className="meta">{t('people.inCredit')}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
