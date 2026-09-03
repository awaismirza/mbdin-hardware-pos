import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '../../appStore';
import { download } from '../../backup/share';
import { rowsToCsv } from '../../backup/exporters';
import { totalOutstanding } from '../../db/repos/customersRepo';
import { topDebtors, type Debtor } from '../../db/repos/ledgerRepo';
import {
  salesByDay,
  salesRows,
  summary,
  topProducts,
  type DaySummary,
  type SalesByDay,
  type TopProduct,
} from '../../db/repos/reportsRepo';
import { listLowStock, type LowStockRow } from '../../db/repos/stockRepo';
import { shopSlug } from '../../db/repos/settingsRepo';
import { pickName } from '../../i18n';
import { fileStamp, resolveRange, karachiDay, type RangeKey } from '../../lib/dates';
import { formatPKR, formatQty } from '../../lib/money';

import './reports.css';

const RANGES: readonly { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'common.today' },
  { key: 'yesterday', label: 'common.yesterday' },
  { key: 'week', label: 'common.thisWeek' },
  { key: 'month', label: 'common.thisMonth' },
  { key: 'custom', label: 'common.custom' },
] as const;

export function ReportsScreen() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useApp((state) => state.settings);

  const [rangeKey, setRangeKey] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState(karachiDay());
  const [customTo, setCustomTo] = useState(karachiDay());

  const [totals, setTotals] = useState<DaySummary | null>(null);
  const [byDay, setByDay] = useState<SalesByDay[]>([]);
  const [byRevenue, setByRevenue] = useState<TopProduct[]>([]);
  const [byQty, setByQty] = useState<TopProduct[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);

  const range = useMemo(
    () => resolveRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  const load = useCallback(async () => {
    const [figures, days, revenue, quantity, owed, top, low] = await Promise.all([
      summary(range),
      salesByDay(range),
      topProducts(range, 'revenue', 8),
      topProducts(range, 'qty', 8),
      totalOutstanding(),
      topDebtors(5),
      listLowStock(20),
    ]);
    setTotals(figures);
    setByDay(days);
    setByRevenue(revenue);
    setByQty(quantity);
    setOutstanding(owed);
    setDebtors(top);
    setLowStock(low);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    try {
      const rows = await salesRows(range);
      const slug = shopSlug(settings['shop_name'] ?? '');
      await download({
        name: `dukaan-${slug}-sales-${range.fromDay}-to-${range.toDay}-${fileStamp()}.csv`,
        type: 'text/csv',
        blob: new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' }),
      });
      toast(t('backup.done'));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    }
  }

  const peak = Math.max(1, ...byDay.map((day) => day.grossPaisa));
  const topRevenue = Math.max(1, ...byRevenue.map((entry) => entry.revenuePaisa));
  const topQty = Math.max(1, ...byQty.map((entry) => entry.qty));

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('reports.title')}</h1>
        <button type="button" className="btn" onClick={() => void exportCsv()}>
          {t('reports.exportCsv')}
        </button>
      </div>

      <div className="range-row">
        <div className="chip-row">
          {RANGES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="chip"
              aria-pressed={rangeKey === entry.key}
              onClick={() => setRangeKey(entry.key)}
              data-testid={`range-${entry.key}`}
            >
              {t(entry.label as never)}
            </button>
          ))}
        </div>
      </div>

      {rangeKey === 'custom' && (
        <div className="custom-range">
          <label className="field">
            <span className="field__label">{t('common.from')}</span>
            <input
              className="input num"
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('common.to')}</span>
            <input
              className="input num"
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className="screen__body">
        {/* One loud number per screen: what the shop took in this period. */}
        <div className="report-hero">
          <span className="report-hero__label">{t('reports.gross')}</span>
          <span className="report-hero__value" data-testid="report-gross">
            {formatPKR(totals?.grossPaisa ?? 0)}
          </span>
          <span className="report-hero__sub">
            {totals?.saleCount ?? 0} {t('reports.salesCount').toLowerCase()}
            {totals && totals.voidedCount > 0
              ? ` · ${String(totals.voidedCount)} ${t('reports.voided').toLowerCase()}`
              : ''}
          </span>
        </div>

        {byDay.length > 1 && (
          <>
            <div className="daybars" aria-hidden="true">
              {byDay.map((day) => (
                <div
                  key={day.day}
                  className={`daybar${day.grossPaisa === 0 ? ' daybar--empty' : ''}`}
                  style={{ blockSize: `${String(Math.max(2, (day.grossPaisa / peak) * 100))}%` }}
                  title={`${day.day}: ${formatPKR(day.grossPaisa)}`}
                />
              ))}
            </div>
            <div className="daybars__labels">
              <span>{byDay[0]?.day}</span>
              <span>{byDay[byDay.length - 1]?.day}</span>
            </div>
          </>
        )}

        <Figure label={t('reports.cash')} value={totals?.cashPaisa ?? 0} tone="good" testId="report-cash" />
        <Figure
          label={t('reports.creditGiven')}
          value={totals?.creditGivenPaisa ?? 0}
          tone={totals && totals.creditGivenPaisa > 0 ? 'bad' : undefined}
          testId="report-credit"
        />
        <Figure
          label={t('reports.paymentsReceived')}
          value={totals?.paymentsReceivedPaisa ?? 0}
          tone="good"
          testId="report-payments"
        />
        <Figure label={t('common.discount')} value={totals?.discountPaisa ?? 0} />
        <Figure
          label={t('reports.profit')}
          hint={t('reports.profitHint')}
          value={totals?.profitPaisa ?? 0}
          tone={totals && totals.profitPaisa < 0 ? 'bad' : 'good'}
          testId="report-profit"
        />

        <div className="section-head">{t('reports.topByRevenue')}</div>
        {byRevenue.length === 0 && <p className="screen__pad meta">{t('reports.noSales')}</p>}
        {byRevenue.map((entry) => (
          <div key={`${String(entry.productId)}-${entry.name}`} className="rank">
            <span
              className="rank__fill"
              style={{ inlineSize: `${String((entry.revenuePaisa / topRevenue) * 100)}%` }}
            />
            <span className="rank__name">
              <span className="truncate">{entry.name}</span>
              <span className="rank__meta">{formatQty(entry.qty)}</span>
            </span>
            <span className="rank__value">{formatPKR(entry.revenuePaisa)}</span>
          </div>
        ))}

        <div className="section-head">{t('reports.topByQty')}</div>
        {byQty.length === 0 && <p className="screen__pad meta">{t('reports.noSales')}</p>}
        {byQty.map((entry) => (
          <div key={`${String(entry.productId)}-${entry.name}-qty`} className="rank">
            <span
              className="rank__fill"
              style={{ inlineSize: `${String((entry.qty / topQty) * 100)}%` }}
            />
            <span className="rank__name">
              <span className="truncate">{entry.name}</span>
              <span className="rank__meta">{formatPKR(entry.revenuePaisa)}</span>
            </span>
            <span className="rank__value num">{formatQty(entry.qty)}</span>
          </div>
        ))}

        <div className="section-head">{t('reports.outstanding')}</div>
        <Figure
          label={t('reports.outstanding')}
          value={outstanding}
          tone={outstanding > 0 ? 'bad' : 'good'}
          testId="report-outstanding"
        />
        {debtors.length === 0 && <p className="screen__pad meta">{t('reports.noDebtors')}</p>}
        {debtors.map((debtor) => (
          <button
            key={debtor.id}
            type="button"
            className="list__row"
            onClick={() => navigate(`/people/${String(debtor.id)}`)}
          >
            <span className="list__main">
              <span className="list__name truncate">{debtor.name}</span>
              {debtor.phone && <span className="list__meta num">{debtor.phone}</span>}
            </span>
            <span className="money" style={{ color: 'var(--seal)' }}>
              {formatPKR(debtor.balancePaisa)}
            </span>
          </button>
        ))}

        <div className="section-head">{t('reports.lowStock')}</div>
        {lowStock.length === 0 && <p className="screen__pad meta">{t('reports.noLowStock')}</p>}
        {lowStock.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`list__row list__row--flag${
              row.stockQty <= 0 ? ' list__row--flag-out' : ''
            }`}
            onClick={() => navigate(`/stock/product/${String(row.id)}/detail`)}
          >
            <span className="list__main">
              <span className="list__name truncate">
                {pickName(language, row.nameUr, row.nameEn)}
              </span>
              <span className="list__meta num">
                {t('stock.lowThreshold')} {formatQty(row.lowStockThreshold)}
              </span>
            </span>
            <span className="money num">
              {formatQty(row.stockQty)} {t(`unit.${row.unit}` as never)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
  testId,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'good' | 'bad';
  testId?: string;
}) {
  return (
    <div className="figure">
      <span className="figure__label">
        {label}
        {hint && <span className="figure__hint">{hint}</span>}
      </span>
      <span
        className={`figure__value${tone ? ` figure__value--${tone}` : ''}`}
        data-testid={testId}
      >
        {formatPKR(value)}
      </span>
    </div>
  );
}
