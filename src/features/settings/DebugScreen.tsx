import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useT, useToast } from '../../appStore';
import { db } from '../../db/client';
import { formatDateTime, nowIso } from '../../lib/dates';

interface DebugRow {
  key: string;
  value: string;
}

/**
 * The storage check. This is the screen that proves M1: it shows which storage
 * path opened, lets you write a row, and lets you force the other path so both
 * can be verified on the same device.
 *
 * The test rows live in `meta` under debug_* keys, so the check exercises the
 * real transaction path without inventing a table that ships to a shopkeeper.
 */
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

  /**
   * Fills the shop with a realistic sample catalogue. This is how the "400
   * products search in under 100 ms" figure gets checked on the actual tablet
   * rather than only in a Node test.
   */
  async function seed() {
    setBusy(true);
    try {
      const { seedSampleCatalogue } = await import('../../db/seed');
      const made = await seedSampleCatalogue({ count: 400 });
      toast(t('debug.seeded', { count: made }));
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Times the catalogue search the Sell screen depends on, on this device.
   *
   * The budget is 100 ms at 2,000 products. A cheap tablet is a different
   * machine from a laptop, so this measures where it matters rather than
   * trusting a number from a development box.
   */
  async function benchmark() {
    setBusy(true);
    try {
      const { listProducts } = await import('../../db/repos/productsRepo');
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

  return (
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/settings')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title">{t('debug.title')}</h1>
      </div>

      <div className="screen__body">
        <div className="kv">
          <span className="kv__key">{t('debug.mode')}</span>
          <span className="kv__value" data-testid="storage-mode">
            {info?.mode === 'opfs' ? t('settings.storageOpfs') : t('settings.storageIdb')}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('debug.schema')}</span>
          <span className="kv__value num">{info?.schemaVersion ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('debug.sqlite')}</span>
          <span className="kv__value num">{info?.sqliteVersion ?? '—'}</span>
        </div>
        {info?.fallbackReason && (
          <div className="kv">
            <span className="kv__key">{t('debug.fallbackReason')}</span>
            <span className="kv__value">{info.fallbackReason}</span>
          </div>
        )}
        <div className="kv">
          <span className="kv__key">{t('settings.onHomeScreen')}</span>
          <span className="kv__value" data-testid="on-home-screen">
            {installed ? t('settings.persistentYes') : t('settings.persistentNo')}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('debug.persisted')}</span>
          <span className="kv__value" data-testid="persisted-status">
            {persisted === null ? '—' : persisted ? t('settings.persistentYes') : t('settings.persistentNo')}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('settings.dbSize')}</span>
          <span className="kv__value num">{dbBytes === null ? '—' : formatBytes(dbBytes)}</span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('debug.products')}</span>
          <span className="kv__value num" data-testid="product-count">
            {productCount ?? '—'}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('debug.searchSpeed')}</span>
          <span className="kv__value num" data-testid="search-ms">
            {searchMs === null ? '—' : `${searchMs} ms`}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('debug.usage')}</span>
          <span className="kv__value num">
            {estimate?.usage === undefined ? '—' : formatBytes(estimate.usage)}
            {estimate?.quota !== undefined ? ` / ${formatBytes(estimate.quota)}` : ''}
          </span>
        </div>

        <div className="section-head">
          <span>{t('debug.testRow')}</span>
          <span className="section-head__spacer" />
          <span className="meta num">{rows.length}</span>
        </div>

        <p className="meta screen__pad" style={{ paddingBlock: 0 }}>
          {t('debug.hint')}
        </p>

        <div className="screen__pad row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            data-testid="write-row"
            onClick={() => void writeRow()}
            disabled={busy}
          >
            {t('debug.writeRow')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="clear-rows"
            onClick={() => void clearRows()}
            disabled={busy}
          >
            {t('action.clear')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="benchmark-search"
            onClick={() => void benchmark()}
            disabled={busy}
          >
            {t('debug.runBenchmark')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="seed-catalogue"
            onClick={() => void seed()}
            disabled={busy}
          >
            {t('debug.seed')}
          </button>
        </div>

        <div className="section-head">{t('debug.switchTitle')}</div>
        <p className="meta screen__pad" style={{ paddingBlock: 0 }}>
          {t('debug.switchHint')}
        </p>
        <div className="screen__pad row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            data-testid="force-idb"
            onClick={() => void reopenAs('idb')}
            disabled={busy}
          >
            {t('debug.forceIdb')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="force-opfs"
            onClick={() => void reopenAs('opfs')}
            disabled={busy}
          >
            {t('debug.forceOpfs')}
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t('debug.reload')}
          </button>
        </div>

        <ul className="list" style={{ listStyle: 'none' }}>
          {rows.map((row) => (
            <li key={row.key} className="list__row">
              <span className="list__main truncate num">{row.key}</span>
              <span className="meta num">{formatDateTime(row.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
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
