import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useT, useToast } from '@/appStore';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { db } from '@/db/client';
import { formatDateTime, nowIso } from '@/lib/dates';

interface DebugRow {
  key: string;
  value: string;
}

export function DebugScreen() {
  const t = useT();
  const navigate = useNavigate();
  const info = useApp((state) => state.info);
  const persisted = useApp((state) => state.persisted);
  const installed = useApp((state) => state.installed);
  const boot = useApp((state) => state.boot);
  const toast = useToast();

  const [rows, setRows] = useState<DebugRow[]>([]);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [dbBytes, setDbBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchMs, setSearchMs] = useState<number | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const found = await db.query<DebugRow>(
      `SELECT key, value FROM meta WHERE key LIKE 'debug_row_%' ORDER BY key`,
    );
    setRows(found);
    setDbBytes(await db.byteSize());
    const counted = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products');
    setProductCount(counted?.n ?? 0);
    if (navigator.storage?.estimate) {
      setEstimate(await navigator.storage.estimate());
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function writeRow() {
    setBusy(true);
    try {
      const key = `debug_row_${String(Date.now())}`;
      await db.exec(
        `INSERT INTO meta(key, value) VALUES(?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, nowIso()],
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function clearRows() {
    setBusy(true);
    try {
      await db.exec(`DELETE FROM meta WHERE key LIKE 'debug_row_%'`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function seed() {
    setBusy(true);
    try {
      const { seedSampleCatalogue } = await import('@/db/seed');
      const made = await seedSampleCatalogue({ count: 400 });
      toast(t('debug.seeded', { count: made }));
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function benchmark() {
    setBusy(true);
    try {
      const { listProducts } = await import('@/db/repos/productsRepo');
      const terms = ['چین', 'sug', 'gh', 'daal', 'SKU01', ''];
      let worst = 0;
      for (const term of terms) {
        const started = performance.now();
        await listProducts({ search: term });
        worst = Math.max(worst, performance.now() - started);
      }
      setSearchMs(Math.round(worst));
    } finally {
      setBusy(false);
    }
  }

  async function reopenAs(mode: 'opfs' | 'idb') {
    setBusy(true);
    try {
      await boot(mode);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const kv = (label: string, value: React.ReactNode, testid?: string) => (
    <div className="flex items-baseline gap-3 py-2 text-sm">
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="text-end" data-testid={testid}>
        {value}
      </span>
    </div>
  );

  return (
    <Screen title={t('debug.title')} onBack={() => navigate('/settings')}>
      <div className="p-4">
        <div className="divide-y rounded-xl border px-4">
          {kv(
            t('debug.mode'),
            info?.mode === 'opfs' ? t('settings.storageOpfs') : t('settings.storageIdb'),
            'storage-mode',
          )}
          {kv(t('debug.schema'), <span className="num">{info?.schemaVersion ?? '—'}</span>)}
          {kv(t('debug.sqlite'), <span className="num">{info?.sqliteVersion ?? '—'}</span>)}
          {info?.fallbackReason && kv(t('debug.fallbackReason'), info.fallbackReason)}
          {kv(
            t('settings.onHomeScreen'),
            installed ? t('settings.persistentYes') : t('settings.persistentNo'),
            'on-home-screen',
          )}
          {kv(
            t('debug.persisted'),
            persisted === null
              ? '—'
              : persisted
                ? t('settings.persistentYes')
                : t('settings.persistentNo'),
            'persisted-status',
          )}
          {kv(
            t('settings.dbSize'),
            <span className="num">{dbBytes === null ? '—' : formatBytes(dbBytes)}</span>,
          )}
          {kv(
            t('debug.products'),
            <span className="num" data-testid="product-count">
              {productCount ?? '—'}
            </span>,
          )}
          {kv(
            t('debug.searchSpeed'),
            <span className="num" data-testid="search-ms">
              {searchMs === null ? '—' : `${searchMs} ms`}
            </span>,
          )}
          {kv(
            t('debug.usage'),
            <span className="num">
              {estimate?.usage === undefined ? '—' : formatBytes(estimate.usage)}
              {estimate?.quota !== undefined ? ` / ${formatBytes(estimate.quota)}` : ''}
            </span>,
          )}
        </div>

        <h2 className="mt-6 mb-1 flex items-center gap-3 text-base font-semibold">
          {t('debug.testRow')}
          <span className="num ms-auto text-sm text-muted-foreground">{rows.length}</span>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('debug.hint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="write-row" onClick={() => void writeRow()} disabled={busy}>
            {t('debug.writeRow')}
          </Button>
          <Button
            variant="outline"
            data-testid="clear-rows"
            onClick={() => void clearRows()}
            disabled={busy}
          >
            {t('action.clear')}
          </Button>
          <Button
            variant="outline"
            data-testid="benchmark-search"
            onClick={() => void benchmark()}
            disabled={busy}
          >
            {t('debug.runBenchmark')}
          </Button>
          <Button
            variant="outline"
            data-testid="seed-catalogue"
            onClick={() => void seed()}
            disabled={busy}
          >
            {t('debug.seed')}
          </Button>
        </div>

        <h2 className="mt-6 mb-1 text-base font-semibold">{t('debug.switchTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('debug.switchHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            data-testid="force-idb"
            onClick={() => void reopenAs('idb')}
            disabled={busy}
          >
            {t('debug.forceIdb')}
          </Button>
          <Button
            variant="outline"
            data-testid="force-opfs"
            onClick={() => void reopenAs('opfs')}
            disabled={busy}
          >
            {t('debug.forceOpfs')}
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('debug.reload')}
          </Button>
        </div>

        <ul className="mt-4 divide-y rounded-xl border">
          {rows.map((row) => (
            <li
              key={row.key}
              data-testid="debug-row"
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="num min-w-0 flex-1 truncate">{row.key}</span>
              <span className="num text-muted-foreground">{formatDateTime(row.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]!}`;
}
