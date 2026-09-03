import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useT } from '../../appStore';
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
  const boot = useApp((state) => state.boot);

  const [rows, setRows] = useState<DebugRow[]>([]);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [dbBytes, setDbBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const found = await db.query<DebugRow>(
      `SELECT key, value FROM meta WHERE key LIKE 'debug_row_%' ORDER BY key`,
    );
    setRows(found);
    setDbBytes(await db.byteSize());
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
          <span className="kv__key">{t('debug.persisted')}</span>
          <span className="kv__value">
            {persisted === null ? '—' : persisted ? t('settings.persistentYes') : t('settings.persistentNo')}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">{t('settings.dbSize')}</span>
          <span className="kv__value num">{dbBytes === null ? '—' : formatBytes(dbBytes)}</span>
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
