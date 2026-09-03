import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '@/appStore';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { download } from '@/backup/share';
import { rowsToCsv } from '@/backup/exporters';
import { totalOutstanding } from '@/db/repos/customersRepo';
import { topDebtors, type Debtor } from '@/db/repos/ledgerRepo';
import {
  salesByDay,
  salesRows,
  summary,
  topProducts,
  type DaySummary,
  type SalesByDay,
  type TopProduct,
} from '@/db/repos/reportsRepo';
import { listLowStock, type LowStockRow } from '@/db/repos/stockRepo';
import { shopSlug } from '@/db/repos/settingsRepo';
import { pickName } from '@/i18n';
import { fileStamp, resolveRange, karachiDay, type RangeKey } from '@/lib/dates';
import { formatPKR, formatQty } from '@/lib/money';
import { cn } from '@/lib/cn';

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
    <Screen
      title={t('reports.title')}
      scroll={false}
      actions={
        <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
          {t('reports.exportCsv')}
        </Button>
      }
    >
      <div className="flex shrink-0 gap-2 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RANGES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={rangeKey === entry.key}
            onClick={() => setRangeKey(entry.key)}
            data-testid={`range-${entry.key}`}
            className={cn(
              'h-10 flex-none rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
              rangeKey === entry.key
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(entry.label as never)}
          </button>
        ))}
      </div>

      {rangeKey === 'custom' && (
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b p-4">
          <div className="grid gap-2">
            <Label htmlFor="range-from">{t('common.from')}</Label>
            <Input
              id="range-from"
              className="num"
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="range-to">{t('common.to')}</Label>
            <Input
              id="range-to"
              className="num"
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid place-items-center gap-1 border-b p-6 text-center">
          <span className="text-sm text-muted-foreground">{t('reports.gross')}</span>
          <span className="money text-4xl font-bold text-primary" data-testid="report-gross">
            {formatPKR(totals?.grossPaisa ?? 0)}
          </span>
          <span className="text-sm text-muted-foreground">
            {totals?.saleCount ?? 0} {t('reports.salesCount').toLowerCase()}
            {totals && totals.voidedCount > 0
              ? ` · ${String(totals.voidedCount)} ${t('reports.voided').toLowerCase()}`
              : ''}
          </span>
        </div>

        {byDay.length > 1 && (
          <div className="border-b p-4">
            <div className="flex h-24 items-end gap-1" aria-hidden="true">
              {byDay.map((day) => (
                <div
                  key={day.day}
                  className={cn(
                    'flex-1 rounded-t-sm',
                    day.grossPaisa === 0 ? 'bg-border' : 'bg-primary/70',
                  )}
                  style={{ height: `${String(Math.max(2, (day.grossPaisa / peak) * 100))}%` }}
                  title={`${day.day}: ${formatPKR(day.grossPaisa)}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{byDay[0]?.day}</span>
              <span>{byDay[byDay.length - 1]?.day}</span>
            </div>
          </div>
        )}

        <div className="divide-y">
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
        </div>

        <Section title={t('reports.topByRevenue')}>
          {byRevenue.length === 0 && <Empty>{t('reports.noSales')}</Empty>}
          {byRevenue.map((entry) => (
            <Rank
              key={`${String(entry.productId)}-${entry.name}`}
              name={entry.name}
              meta={formatQty(entry.qty)}
              value={formatPKR(entry.revenuePaisa)}
              fill={(entry.revenuePaisa / topRevenue) * 100}
            />
          ))}
        </Section>

        <Section title={t('reports.topByQty')}>
          {byQty.length === 0 && <Empty>{t('reports.noSales')}</Empty>}
          {byQty.map((entry) => (
            <Rank
              key={`${String(entry.productId)}-${entry.name}-qty`}
              name={entry.name}
              meta={formatPKR(entry.revenuePaisa)}
              value={formatQty(entry.qty)}
              fill={(entry.qty / topQty) * 100}
            />
          ))}
        </Section>

        <Section title={t('reports.outstanding')}>
          <div className="divide-y border-y">
            <Figure
              label={t('reports.outstanding')}
              value={outstanding}
              tone={outstanding > 0 ? 'bad' : 'good'}
              testId="report-outstanding"
            />
          </div>
          {debtors.length === 0 && <Empty>{t('reports.noDebtors')}</Empty>}
          {debtors.map((debtor) => (
            <button
              key={debtor.id}
              type="button"
              onClick={() => navigate(`/people/${String(debtor.id)}`)}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start hover:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{debtor.name}</span>
                {debtor.phone && (
                  <span className="num block text-sm text-muted-foreground">{debtor.phone}</span>
                )}
              </span>
              <span className="money text-destructive">{formatPKR(debtor.balancePaisa)}</span>
            </button>
          ))}
        </Section>

        <Section title={t('reports.lowStock')}>
          {lowStock.length === 0 && <Empty>{t('reports.noLowStock')}</Empty>}
          {lowStock.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => navigate(`/stock/product/${String(row.id)}/detail`)}
              className={cn(
                'flex min-h-12 w-full items-center gap-3 border-s-2 px-4 py-2 text-start hover:bg-accent',
                row.stockQty <= 0 ? 'border-s-destructive' : 'border-s-warning',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{pickName(language, row.nameUr, row.nameEn)}</span>
                <span className="num block text-sm text-muted-foreground">
                  {t('stock.lowThreshold')} {formatQty(row.lowStockThreshold)}
                </span>
              </span>
              <span className="money num">
                {formatQty(row.stockQty)} {t(`unit.${row.unit}` as never)}
              </span>
            </button>
          ))}
        </Section>
      </div>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="px-4 pt-6 pb-2 text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-2 text-sm text-muted-foreground">{children}</p>;
}

function Rank({
  name,
  meta,
  value,
  fill,
}: {
  name: string;
  meta: string;
  value: string;
  fill: number;
}) {
  return (
    <div className="relative flex items-baseline gap-3 px-4 py-3">
      <span
        className="absolute inset-y-1 start-0 rounded-e-md bg-primary/10"
        style={{ width: `${String(fill)}%` }}
        aria-hidden="true"
      />
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate">{name}</span>
        <span className="num block text-xs text-muted-foreground">{meta}</span>
      </span>
      <span className="num relative z-10 font-semibold tabular-nums">{value}</span>
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
    <div className="flex items-baseline gap-3 px-4 py-3">
      <span className="flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          'money',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
        )}
        data-testid={testId}
      >
        {formatPKR(value)}
      </span>
    </div>
  );
}
