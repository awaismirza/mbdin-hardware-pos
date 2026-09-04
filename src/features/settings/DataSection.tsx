import { useEffect, useRef, useState } from 'react';

import { useApp, useT, useToast } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listArchives, writeArchive, type ArchiveEntry } from '@/backup/archive';
import {
  AUTO_EXPORT_FOLDER,
  LAST_AUTO_EXPORT,
  chooseAutoExportFolder,
  forgetAutoExportFolder,
  supportsAutoExport,
} from '@/backup/autoExport';
import { exportCsvFiles, exportJson, exportSqlite, type ExportFormat } from '@/backup/exporters';
import {
  NewerBackupError,
  UnreadableBackupError,
  readCandidate,
  restore,
  type Candidate,
} from '@/backup/importer';
import { canShareFiles, download, shareFile } from '@/backup/share';
import { db } from '@/db/client';
import { toCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { formatBytes } from './DebugScreen';

const FORMATS: readonly { key: ExportFormat; label: `backup.format${string}` }[] = [
  { key: 'sqlite', label: 'backup.formatSqlite' },
  { key: 'json', label: 'backup.formatJson' },
  { key: 'csv', label: 'backup.formatCsv' },
] as const;

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-panel shadow-card">
      <h2 className="flex items-center gap-3 border-b border-line px-4 py-3.5 text-[14.5px] font-bold">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function KV({
  label,
  children,
  testid,
}: {
  label: string;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line py-2 text-[13px] last:border-b-0">
      <span className="flex-1 text-fg2">{label}</span>
      <span className="text-end font-semibold" data-testid={testid}>
        {children}
      </span>
    </div>
  );
}

export function DataSection() {
  const t = useT();
  const toast = useToast();
  const info = useApp((state) => state.info);
  const persisted = useApp((state) => state.persisted);
  const installed = useApp((state) => state.installed);
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
    const files = await exportCsvFiles();
    const combined = files.map((file) => `${toCsv([[file.name]])}${file.text}`).join('\r\n');
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
      window.location.assign(`${import.meta.env.BASE_URL}sell`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
      setBusy(false);
    }
  }

  const lastBackup = settings['last_backup_at'] ?? '';
  const primaryDownload = !canShareFiles();

  return (
    <>
      <Section title={t('settings.data')}>
        <div className="divide-y">
          <KV label={t('settings.storageMode')}>
            {info?.mode === 'opfs' ? t('settings.storageOpfs') : t('settings.storageIdb')}
          </KV>
          <KV label={t('settings.dbSize')}>
            <span className="num">{dbBytes === null ? '—' : formatBytes(dbBytes)}</span>
          </KV>
          <KV label={t('settings.spaceUsed')}>
            <span className="num">
              {estimate?.usage === undefined ? '—' : formatBytes(estimate.usage)}
              {estimate?.quota !== undefined ? ` / ${formatBytes(estimate.quota)}` : ''}
            </span>
          </KV>
          <KV label={t('settings.onHomeScreen')} testid="on-home-screen">
            {installed ? t('settings.persistentYes') : t('settings.persistentNo')}
          </KV>
          <KV label={t('settings.persistent')} testid="persisted-status">
            {persisted === null
              ? '—'
              : persisted
                ? t('settings.persistentYes')
                : t('settings.persistentNo')}
          </KV>
          <KV label={t('settings.lastBackup')} testid="last-backup">
            <span className="num">
              {lastBackup ? formatDateTime(lastBackup) : t('settings.never')}
            </span>
          </KV>
        </div>
      </Section>

      <Section title={t('backup.title')}>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t('backup.format')}</Label>
            {/* One per row: the format names carry their file extension and do
                not survive being squeezed into thirds of a narrow column. */}
            <div className="grid gap-2">
              {FORMATS.map((entry) => (
                <Button
                  key={entry.key}
                  variant="outline"
                  aria-pressed={format === entry.key}
                  onClick={() => setFormat(entry.key)}
                  data-testid={`format-${entry.key}`}
                  className={cn(
                    'justify-start',
                    format === entry.key && 'border-fg bg-fg text-bg hover:bg-fg',
                  )}
                >
                  {t(entry.label as never)}
                </Button>
              ))}
            </div>
          </div>

          {canShareFiles() && (
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => void send('share')}
              data-testid="backup-share"
            >
              {t('backup.share')}
            </Button>
          )}

          <Button
            variant={primaryDownload ? 'default' : 'outline'}
            size={primaryDownload ? 'lg' : 'default'}
            className="w-full"
            disabled={busy}
            onClick={() => void send('download')}
            data-testid="backup-download"
          >
            {t('backup.download')}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void copyToArchive()}
            data-testid="backup-archive"
          >
            {t('backup.archive')}
          </Button>
          <p className="text-[13px] text-fg2">{t('backup.archiveHint')}</p>
        </div>
      </Section>

      <AutoExportSection />

      <Section
        title={
          <>
            <span>{t('backup.archives')}</span>
            <span className="num ms-auto text-sm text-muted-foreground">{archives.length}</span>
          </>
        }
      >
        {archives.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('backup.archivesEmpty')}</p>
        ) : (
          <div className="divide-y">
            {archives.map((entry) => (
              <div key={entry.name} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="num flex-1 truncate">{entry.name}</span>
                <span className="num">{formatBytes(entry.size)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('backup.restore')}>
        <div className="grid gap-3">
          {/* A wide-open accept list on purpose: iOS Files greys out a
              .sqlite3 that arrived by AirDrop unless every file is selectable,
              and pickRestoreFile validates the contents on read regardless. */}
          <input
            ref={fileInput}
            type="file"
            accept="*/*,.sqlite3,.sqlite,.db,.json,application/json,application/octet-stream"
            className="sr-only"
            onChange={(event) => void pickRestoreFile(event.target.files?.[0])}
            data-testid="restore-input"
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {t('backup.restoreChoose')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('backup.restoreSafety')}</p>
        </div>
      </Section>

      {/* Spec: the danger card sits on --bad-soft with a --bad border, and is
          the only place a red action is allowed. */}
      <section className="rounded-[14px] border border-bad bg-bad-soft p-4">
        <h2 className="mb-1.5 text-sm font-bold text-bad">{t('reset.title')}</h2>
        <p className="mb-3 text-xs text-fg2">{t('reset.warning')}</p>
        <Button variant="destructive" onClick={() => setResetting(true)} data-testid="reset-open">
          {t('reset.title')}
        </Button>
      </section>

      {candidate && (
        <Dialog
          title={t('backup.restoreConfirmTitle')}
          onClose={() => setCandidate(null)}
          hideClose
          footer={
            <>
              <Button variant="outline" onClick={() => setCandidate(null)}>
                {t('action.cancel')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => void doRestore()}
                data-testid="confirm-restore"
              >
                {busy ? t('backup.restoring') : t('action.confirm')}
              </Button>
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
          <p className="mt-3 text-sm text-muted-foreground">{t('backup.restoreSafety')}</p>
        </Dialog>
      )}

      {resetting && <ResetDialog onClose={() => setResetting(false)} />}
    </>
  );
}

/**
 * Automatic daily backup into a folder.
 *
 * Only rendered where the browser can actually do it — desktop Chromium. On a
 * phone or tablet there is no API that writes to iCloud Drive or Google Drive
 * without a tap, so the card says what the shopkeeper's real option is instead
 * of offering a switch that would quietly do nothing. See docs/auto-backup.md.
 */
function AutoExportSection() {
  const t = useT();
  const toast = useToast();
  const settings = useApp((state) => state.settings);
  const refreshSettings = useApp((state) => state.refreshSettings);
  const [busy, setBusy] = useState(false);

  const folder = settings[AUTO_EXPORT_FOLDER] ?? '';
  const lastAuto = settings[LAST_AUTO_EXPORT] ?? '';

  if (!supportsAutoExport()) {
    return (
      <Section title={t('backup.autoTitle')}>
        <p className="text-[13px] leading-relaxed text-fg2" data-testid="auto-export-unavailable">
          {t('backup.autoUnavailable')}
        </p>
      </Section>
    );
  }

  async function choose() {
    setBusy(true);
    try {
      const name = await chooseAutoExportFolder();
      if (name) {
        await refreshSettings();
        toast(t('backup.autoChosen', { folder: name }));
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    await forgetAutoExportFolder();
    await refreshSettings();
  }

  return (
    <Section title={t('backup.autoTitle')}>
      <div className="grid gap-3">
        <p className="text-[13px] leading-relaxed text-fg2">{t('backup.autoHint')}</p>
        <div className="divide-y">
          <KV label={t('backup.autoFolder')} testid="auto-export-folder">
            {folder || t('settings.never')}
          </KV>
          <KV label={t('backup.autoLast')} testid="auto-export-last">
            <span className="num">{lastAuto ? formatDateTime(lastAuto) : t('settings.never')}</span>
          </KV>
        </div>
        <Button
          variant={folder ? 'outline' : 'default'}
          className="w-full"
          disabled={busy}
          onClick={() => void choose()}
          data-testid="auto-export-choose"
        >
          {folder ? t('backup.autoChange') : t('backup.autoChoose')}
        </Button>
        {folder && (
          <Button variant="muted" className="w-full" onClick={() => void forget()}>
            {t('backup.autoStop')}
          </Button>
        )}
      </div>
    </Section>
  );
}

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
          <Button variant="outline" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || busy}
            onClick={() => void wipe()}
            data-testid="confirm-reset"
          >
            {t('reset.confirm')}
          </Button>
        </>
      }
    >
      <p className="mb-3">{t('reset.warning')}</p>
      {shopName === '' ? (
        <p className="text-sm text-destructive">{t('reset.noShopName')}</p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="reset-name">{t('reset.typeName')}</Label>
          <Input
            id="reset-name"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={shopName}
          />
        </div>
      )}
    </Dialog>
  );
}
