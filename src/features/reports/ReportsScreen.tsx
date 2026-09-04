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
  // Integer paisa throughout: divide last, and floor rather than round, so the
  // average can never read higher than the takings actually support.
  const averageBasket =
    totals && totals.saleCount > 0 ? Math.floor(totals.grossPaisa / totals.saleCount) : 0;

  return (
    <Screen
      title={t('reports.title')}
      subtitle={t('reports.subtitle')}
      scroll={false}
      actions={
        <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
          {t('reports.exportCsv')}
        </Button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={rangeKey === entry.key}
                onClick={() => setRangeKey(entry.key)}
                data-testid={`range-${entry.key}`}
                className={cn(
                  'h-9 flex-none rounded-[10px] border px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                  rangeKey === entry.key
                    ? 'border-fg bg-fg text-bg'
                    : 'border-line bg-panel text-fg2 hover:text-fg',
                )}
              >
                {t(entry.label as never)}
              </button>
            ))}
          </div>

          {rangeKey === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="range-from">{t('common.from')}</Label>
                <Input
                  id="range-from"
                  className="num"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
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

          {/* The four figures a shopkeeper checks at closing. */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label={t('reports.cash')}
              value={formatPKR(totals?.cashPaisa ?? 0)}
              sub={t('reports.cashSub')}
              tone="ok"
              testId="report-cash"
            />
            <Kpi
              label={t('reports.creditGiven')}
              value={formatPKR(totals?.creditGivenPaisa ?? 0)}
              sub={t('reports.creditGivenSub')}
              tone={totals && totals.creditGivenPaisa > 0 ? 'bad' : undefined}
              testId="report-credit"
            />
            <Kpi
              label={t('reports.profit')}
              value={formatPKR(totals?.profitPaisa ?? 0)}
              sub={t('reports.profitHint')}
              tone={totals && totals.profitPaisa < 0 ? 'bad' : 'ok'}
              testId="report-profit"
            />
            <Kpi
              label={t('reports.averageBasket')}
              value={formatPKR(averageBasket)}
              sub={t('reports.averageBasketSub', { count: totals?.saleCount ?? 0 })}
              testId="report-basket"
            />
          </div>

          {/* Hero takings card, with the per-day bars underneath. */}
          <div className="rounded-2xl border border-line bg-panel p-[18px] shadow-card">
            <div className="label-caps">
              {t('reports.gross')} · {t(RANGES.find((r) => r.key === rangeKey)!.label as never)}
            </div>
            <div className="mt-1.5 mb-0.5 flex items-end gap-3">
              <span
                className="money text-[46px] leading-none font-semibold tracking-[-0.035em]"
                data-testid="report-gross"
              >
                {formatPKR(totals?.grossPaisa ?? 0)}
              </span>
            </div>
            <div className="mb-4 text-[12.5px] text-fg2">
              <span className="num">{totals?.saleCount ?? 0}</span>{' '}
              {t('reports.salesCount').toLowerCase()}
              {totals && totals.voidedCount > 0 ? (
                <>
                  {' · '}
                  <span className="num">{totals.voidedCount}</span>{' '}
                  {t('reports.voided').toLowerCase()}
                </>
              ) : null}
            </div>

            {byDay.length > 1 && (
              <>
                <div className="flex h-24 items-end gap-1.5" aria-hidden="true">
                  {byDay.map((day) => (
                    <div
                      key={day.day}
                      className={cn(
                        'flex-1 rounded-t-[3px]',
                        day.grossPaisa === 0 ? 'bg-line' : 'bg-brand',
                      )}
                      style={{ height: `${String(Math.max(2, (day.grossPaisa / peak) * 100))}%` }}
                      title={`${day.day}: ${formatPKR(day.grossPaisa)}`}
                    />
                  ))}
                </div>
                <div className="num mt-1.5 flex justify-between text-[11px] text-fg2">
                  <span>{byDay[0]?.day}</span>
                  <span>{byDay[byDay.length - 1]?.day}</span>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr] xl:items-start">
            <div className="flex flex-col gap-3">
              <Card title={t('reports.figures')}>
                <Figure
                  label={t('reports.paymentsReceived')}
                  value={totals?.paymentsReceivedPaisa ?? 0}
                  tone="good"
                  testId="report-payments"
                />
                <Figure label={t('common.discount')} value={totals?.discountPaisa ?? 0} />
                <Figure
                  label={t('reports.outstanding')}
                  value={outstanding}
                  tone={outstanding > 0 ? 'bad' : 'good'}
                  testId="report-outstanding"
                />
              </Card>

              <Card title={t('reports.topByRevenue')}>
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
              </Card>

              <Card title={t('reports.topByQty')}>
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
              </Card>
            </div>

            <div className="flex flex-col gap-3">
              <Card title={t('reports.needsAttention')}>
                {debtors.length === 0 && lowStock.length === 0 && (
                  <Empty>{t('reports.nothingNeedsAttention')}</Empty>
                )}
                {debtors.map((debtor) => (
                  <AttentionRow
                    key={`debtor-${String(debtor.id)}`}
                    title={debtor.name}
                    sub={debtor.phone ? <span className="num">{debtor.phone}</span> : null}
                    value={formatPKR(debtor.balancePaisa)}
                    tone="bad"
                    onClick={() => navigate(`/people/${String(debtor.id)}`)}
                  />
                ))}
                {lowStock.map((row) => (
                  <AttentionRow
                    key={`low-${String(row.id)}`}
                    title={pickName(language, row.nameUr, row.nameEn)}
                    sub={
                      <>
                        {t('stock.lowThreshold')}{' '}
                        <span className="num">{formatQty(row.lowStockThreshold)}</span>
                      </>
                    }
                    value={
                      <>
                        <span className="num">{formatQty(row.stockQty)}</span>{' '}
                        {t(`unit.${row.unit}` as never)}
                      </>
                    }
                    tone={row.stockQty <= 0 ? 'bad' : 'warn'}
                    onClick={() => navigate(`/stock/product/${String(row.id)}/detail`)}
                  />
                ))}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}

/** A KPI card: label in caps, the figure in mono, a line of context. */
function Kpi({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'ok' | 'bad';
  testId?: string;
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
        data-testid={testId}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-fg2">{sub}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-card">
      <div className="border-b border-line px-4 py-3.5 text-[14.5px] font-bold">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-[13px] text-fg2">{children}</p>;
}

/** Ranked row: a `--brand-soft` bar painted behind the row, in proportion. */
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
    <div className="relative flex items-baseline gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span
        className="absolute inset-y-0 start-0 bg-brand-soft"
        style={{ inlineSize: `${String(fill)}%` }}
        aria-hidden="true"
      />
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{name}</span>
        <span className="num block text-[11px] text-fg2">{meta}</span>
      </span>
      <span className="num relative z-10 text-[13.5px] font-semibold">{value}</span>
    </div>
  );
}

function AttentionRow({
  title,
  sub,
  value,
  tone,
  onClick,
}: {
  title: string;
  /** Mixed text: the caller wraps only the numeric run in `.num`. */
  sub: React.ReactNode;
  value: React.ReactNode;
  tone: 'bad' | 'warn';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 border-b border-line px-4 py-2.5 text-start last:border-b-0 hover:bg-panel2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{title}</span>
        {sub && <span className="block truncate text-[11px] text-fg2">{sub}</span>}
      </span>
      <span
        className={cn(
          'shrink-0 text-[13.5px] font-semibold',
          tone === 'bad' ? 'text-bad' : 'text-warn',
        )}
      >
        {value}
      </span>
    </button>
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
    <div className="flex items-baseline gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="flex-1">
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="block text-[11px] text-fg2">{hint}</span>}
      </span>
      <span
        className={cn(
          'money text-[13.5px] font-semibold',
          tone === 'good' && 'text-ok',
          tone === 'bad' && 'text-bad',
        )}
        data-testid={testId}
      >
        {formatPKR(value)}
      </span>
    </div>
  );
}
