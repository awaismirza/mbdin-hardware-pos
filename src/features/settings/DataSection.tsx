import { useEffect, useRef, useState } from 'react';

import { useApp, useT, useToast } from '../../appStore';
import { Dialog } from '../../components/Dialog';
import { listArchives, writeArchive, type ArchiveEntry } from '../../backup/archive';
import { exportCsvFiles, exportJson, exportSqlite, type ExportFormat } from '../../backup/exporters';
import {
  NewerBackupError,
  UnreadableBackupError,
  readCandidate,
  restore,
  type Candidate,
} from '../../backup/importer';
import { canShareFiles, download, shareFile } from '../../backup/share';
import { db } from '../../db/client';
import { toCsv } from '../../lib/csv';
import { formatDateTime } from '../../lib/dates';
import { formatBytes } from './DebugScreen';

const FORMATS: readonly { key: ExportFormat; label: `backup.format${string}` }[] = [
  { key: 'sqlite', label: 'backup.formatSqlite' },
  { key: 'json', label: 'backup.formatJson' },
  { key: 'csv', label: 'backup.formatCsv' },
] as const;

export function DataSection() {
  const t = useT();
  const toast = useToast();
  const info = useApp((state) => state.info);
  const persisted = useApp((state) => state.persisted);
  const settings = useApp((state) => state.settings);
  const refreshSettings = useApp((state) => state.refreshSettings);

  const fileInput = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<ExportFormat>('sqlite');
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [dbBytes, setDbBytes] = useState<number | null>(null);
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    void db.byteSize().then(setDbBytes);
    void listArchives().then(setArchives);
    if (navigator.storage?.estimate) void navigator.storage.estimate().then(setEstimate);
  }, []);

  async function buildFile() {
    if (format === 'sqlite') return exportSqlite();
    if (format === 'json') return exportJson();
    // Several CSVs go out as one file with the sheets appended, each under its
    // own heading — the share sheet takes one file, and five separate shares
    // would be five separate WhatsApp messages.
    const files = await exportCsvFiles();
    const combined = files
      .map((file) => `${toCsv([[file.name]])}${file.text}`)
      .join('\r\n');
    return {
      name: files[0]!.name.replace('-products-', '-all-'),
      type: 'text/csv',
      blob: new Blob([combined], { type: 'text/csv;charset=utf-8' }),
    };
  }

  async function send(via: 'share' | 'download') {
    setBusy(true);
    try {
      const file = await buildFile();
      const result = via === 'share' ? await shareFile(file) : await download(file);
      if (result === 'cancelled') {
        toast(t('backup.shareFailed'), 'warn');
      } else {
        toast(t('backup.done'));
        await refreshSettings();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function copyToArchive() {
    setBusy(true);
    try {
      const name = await writeArchive('manual');
      if (!name) {
        toast(t('backup.shareFailed'), 'warn');
        return;
      }
      setArchives(await listArchives());
      toast(t('backup.done'));
    } finally {
      setBusy(false);
    }
  }

  async function pickRestoreFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setCandidate(await readCandidate(file));
    } catch (error) {
      if (error instanceof NewerBackupError) toast(t('backup.restoreNewer'), 'bad');
      else if (error instanceof UnreadableBackupError) toast(error.message, 'bad');
      else toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function doRestore() {
    if (!candidate) return;
    setBusy(true);
    try {
      await restore(candidate);
      setCandidate(null);
      toast(t('backup.restored'));
      // Reload rather than patch the screens back into agreement: every cached
      // list, the settings and the cart all refer to a database that no longer
      // exists.
      window.location.assign(`${import.meta.env.BASE_URL}sell`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
      setBusy(false);
    }
  }

  const lastBackup = settings['last_backup_at'] ?? '';

  return (
    <>
      <div className="section-head">{t('settings.data')}</div>

      <div className="kv">
        <span className="kv__key">{t('settings.storageMode')}</span>
        <span className="kv__value">
          {info?.mode === 'opfs' ? t('settings.storageOpfs') : t('settings.storageIdb')}
        </span>
      </div>
      <div className="kv">
        <span className="kv__key">{t('settings.dbSize')}</span>
        <span className="kv__value num">{dbBytes === null ? '—' : formatBytes(dbBytes)}</span>
      </div>
      <div className="kv">
        <span className="kv__key">{t('settings.spaceUsed')}</span>
        <span className="kv__value num">
          {estimate?.usage === undefined ? '—' : formatBytes(estimate.usage)}
          {estimate?.quota !== undefined ? ` / ${formatBytes(estimate.quota)}` : ''}
        </span>
      </div>
      <div className="kv">
        <span className="kv__key">{t('settings.persistent')}</span>
        <span className="kv__value">
          {persisted === null
            ? '—'
            : persisted
              ? t('settings.persistentYes')
              : t('settings.persistentNo')}
        </span>
      </div>
      <div className="kv">
        <span className="kv__key">{t('settings.lastBackup')}</span>
        <span className="kv__value num" data-testid="last-backup">
          {lastBackup ? formatDateTime(lastBackup) : t('settings.never')}
        </span>
      </div>

      <div className="section-head">{t('backup.title')}</div>

      <div className="screen__pad stack">
        <div>
          <span className="field__label">{t('backup.format')}</span>
          <div className="methods">
            {FORMATS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="btn"
                aria-pressed={format === entry.key}
                onClick={() => setFormat(entry.key)}
                data-testid={`format-${entry.key}`}
              >
                {t(entry.label as never)}
              </button>
            ))}
          </div>
        </div>

        {canShareFiles() && (
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={busy}
            onClick={() => void send('share')}
            data-testid="backup-share"
          >
            {t('backup.share')}
          </button>
        )}

        <button
          type="button"
          className={`btn btn--block${canShareFiles() ? '' : ' btn--primary btn--lg'}`}
          disabled={busy}
          onClick={() => void send('download')}
          data-testid="backup-download"
        >
          {t('backup.download')}
        </button>

        <button
          type="button"
          className="btn btn--block"
          disabled={busy}
          onClick={() => void copyToArchive()}
          data-testid="backup-archive"
        >
          {t('backup.archive')}
        </button>
        <p className="field__hint">{t('backup.archiveHint')}</p>
      </div>

      <div className="section-head">
        <span>{t('backup.archives')}</span>
        <span className="section-head__spacer" />
        <span className="meta num">{archives.length}</span>
      </div>
      {archives.length === 0 ? (
        <p className="screen__pad meta">{t('backup.archivesEmpty')}</p>
      ) : (
        archives.map((entry) => (
          <div key={entry.name} className="kv">
            <span className="kv__key num">{entry.name}</span>
            <span className="kv__value num">{formatBytes(entry.size)}</span>
          </div>
        ))
      )}

      <div className="section-head">{t('backup.restore')}</div>
      <div className="screen__pad stack">
        <input
          ref={fileInput}
          type="file"
          accept=".sqlite3,.json,application/json,application/vnd.sqlite3"
          className="visually-hidden"
          onChange={(event) => void pickRestoreFile(event.target.files?.[0])}
          data-testid="restore-input"
        />
        <button
          type="button"
          className="btn btn--block"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {t('backup.restoreChoose')}
        </button>
        <p className="field__hint">{t('backup.restoreSafety')}</p>
      </div>

      <div className="section-head" style={{ color: 'var(--seal)' }}>
        {t('reset.title')}
      </div>
      <div className="screen__pad stack">
        <p className="field__hint">{t('reset.warning')}</p>
        <button
          type="button"
          className="btn btn--danger btn--block"
          onClick={() => setResetting(true)}
          data-testid="reset-open"
        >
          {t('reset.title')}
        </button>
      </div>

      {candidate && (
        <Dialog
          title={t('backup.restoreConfirmTitle')}
          onClose={() => setCandidate(null)}
          hideClose
          footer={
            <>
              <button type="button" className="btn" onClick={() => setCandidate(null)}>
                {t('action.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void doRestore()}
                data-testid="confirm-restore"
              >
                {busy ? t('backup.restoring') : t('action.confirm')}
              </button>
            </>
          }
        >
          <p>
            {t('backup.restoreConfirmBody', {
              products: candidate.summary.products,
              sales: candidate.summary.sales,
              customers: candidate.summary.customers,
            })}
          </p>
          <p className="field__hint" style={{ marginBlockStart: 'var(--s3)' }}>
            {t('backup.restoreSafety')}
          </p>
        </Dialog>
      )}

      {resetting && <ResetDialog onClose={() => setResetting(false)} />}
    </>
  );
}

/**
 * Reset requires typing the shop name. Not a "type DELETE" ritual: typing the
 * shop's own name means the person doing it knows which shop they are erasing.
 */
function ResetDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const settings = useApp((state) => state.settings);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const shopName = (settings['shop_name'] ?? '').trim();
  const matches = shopName !== '' && typed.trim() === shopName;

  async function wipe() {
    setBusy(true);
    try {
      await db.resetEverything();
      window.location.assign(`${import.meta.env.BASE_URL}sell`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('reset.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!matches || busy}
            onClick={() => void wipe()}
            data-testid="confirm-reset"
          >
            {t('reset.confirm')}
          </button>
        </>
      }
    >
      <p style={{ marginBlockEnd: 'var(--s3)' }}>{t('reset.warning')}</p>
      {shopName === '' ? (
        <p className="field__error">{t('reset.noShopName')}</p>
      ) : (
        <label className="field">
          <span className="field__label">{t('reset.typeName')}</span>
          <input
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={shopName}
            data-autofocus
          />
        </label>
      )}
    </Dialog>
  );
}
