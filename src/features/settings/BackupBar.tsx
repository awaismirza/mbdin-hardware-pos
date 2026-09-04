import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TriangleAlert, X } from 'lucide-react';

import { useApp, useT } from '@/appStore';
import { Button } from '@/components/ui/button';
import { runDailyArchive } from '@/backup/archive';
import { LAST_AUTO_EXPORT, runDailyAutoExport } from '@/backup/autoExport';
import { INSTALL_SNOOZED } from '@/features/install/InstallPrompt';
import { hoursSince, karachiDay } from '@/lib/dates';
import { shouldWarnAboutPersistence } from '@/lib/protection';

/**
 * Two quiet, non-blocking notices that live above every screen.
 *
 * The amber bar appears when the last real off-device backup is more than a day
 * old. It never blocks anything and never covers the total. The archive copy on
 * this device does not silence it — only a backup that has actually left the
 * tablet does.
 *
 * The persistence banner appears only when the app is both NOT on the home
 * screen and NOT persisted — see lib/protection.ts. An installed app whose
 * persisted flag simply has not caught up (routine, especially on iOS) gets no
 * banner: "add to home screen" is not useful advice to someone who already has.
 */
export function BackupBar() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();

  const settings = useApp((state) => state.settings);
  const status = useApp((state) => state.status);
  const persisted = useApp((state) => state.persisted);
  const installed = useApp((state) => state.installed);
  const saveSetting = useApp((state) => state.saveSetting);
  const refreshSettings = useApp((state) => state.refreshSettings);

  const [archiveChecked, setArchiveChecked] = useState(false);

  // The daily copies, once per boot, in the background. Never awaited by any
  // render path: opening the app must not wait on a file copy.
  //
  // Two of them: the OPFS archive (a safety net beside the ledger) and, where
  // the browser can write to a folder, the automatic off-device export.
  useEffect(() => {
    if (status !== 'ready' || archiveChecked) return;
    setArchiveChecked(true);
    void runDailyArchive(settings['last_archive_at'] ?? '');
    void runDailyAutoExport(settings[LAST_AUTO_EXPORT] ?? '').then((result) => {
      if (result === 'written') void refreshSettings();
    });
  }, [status, archiveChecked, settings, refreshSettings]);

  if (status !== 'ready') return null;

  const lastBackup = settings['last_backup_at'] ?? '';
  const hours = hoursSince(lastBackup || null);
  const overdue = hours > 24;
  const days = Number.isFinite(hours) ? Math.floor(hours / 24) : null;

  // The spec puts this bar on the Sell screen, and that is where it belongs:
  // it is the screen the shop lives on, so it is seen every day without
  // pushing the content of a screen opened for some other reason down.
  const onSellScreen = location.pathname === '/' || location.pathname.startsWith('/sell');
  const bannerDismissed = settings['persist_banner_dismissed'] === '1';

  /*
   * The install prompt covers the same ground with a better action, so only one
   * of the two is ever on screen. This bar is the fallback for the day after
   * the prompt has been snoozed — the risk has not gone away just because the
   * shopkeeper said "not now" this morning.
   */
  const installPromptShowing = !installed && settings[INSTALL_SNOOZED] !== karachiDay();
  const showPersistWarning =
    !installPromptShowing && shouldWarnAboutPersistence(installed, persisted, bannerDismissed);

  return (
    <>
      {showPersistWarning && (
        <Notice
          testid="persist-warning"
          text={t('backup.notPersisted')}
          actionLabel={t('settings.install')}
          onAction={() => navigate('/install')}
          onDismiss={() => void saveSetting('persist_banner_dismissed', '1')}
          dismissLabel={t('backup.dismiss')}
        />
      )}

      {overdue && onSellScreen && (
        <Notice
          testid="backup-overdue"
          text={days && days >= 1 ? t('backup.overdue', { days }) : t('backup.overdueToday')}
          actionLabel={t('backup.backupNow')}
          onAction={() => navigate('/settings')}
        />
      )}
    </>
  );
}

/**
 * One line, never two. These bars sit above every screen, so anything that
 * wraps on a phone steals a third of the till — the message truncates and the
 * action stays reachable instead.
 */
function Notice({
  testid,
  text,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel,
}: {
  testid: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      className="amber-bar flex shrink-0 items-center gap-2 border-b border-line bg-warn-soft px-3 py-1.5 text-warn md:px-4"
      role="status"
      data-testid={testid}
    >
      <TriangleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{text}</span>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-warn/40 bg-transparent text-warn hover:bg-warn/10"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
      {onDismiss && (
        <Button
          size="icon-sm"
          variant="muted"
          className="shrink-0 text-warn hover:bg-warn/10"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
