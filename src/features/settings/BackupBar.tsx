import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useApp, useT } from '../../appStore';
import { runDailyArchive } from '../../backup/archive';
import { hoursSince } from '../../lib/dates';
import { shouldWarnAboutPersistence } from '../../lib/protection';

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

  const [archiveChecked, setArchiveChecked] = useState(false);

  // The daily archive, once per boot, in the background. Never awaited by any
  // render path: opening the app must not wait on a file copy.
  useEffect(() => {
    if (status !== 'ready' || archiveChecked) return;
    setArchiveChecked(true);
    void runDailyArchive(settings['last_archive_at'] ?? '');
  }, [status, archiveChecked, settings]);

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
  const showPersistWarning = shouldWarnAboutPersistence(installed, persisted, bannerDismissed);

  return (
    <>
      {showPersistWarning && (
        <div className="amber-bar" role="status" data-testid="persist-warning">
          <span className="amber-bar__text">{t('backup.notPersisted')}</span>
          <button type="button" className="btn" onClick={() => navigate('/settings')}>
            {t('settings.install')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void saveSetting('persist_banner_dismissed', '1')}
          >
            {t('backup.dismiss')}
          </button>
        </div>
      )}

      {overdue && onSellScreen && (
        <div className="amber-bar" role="status" data-testid="backup-overdue">
          <span className="amber-bar__text">
            {days && days >= 1
              ? t('backup.overdue', { days })
              : t('backup.overdueToday')}
          </span>
          <button type="button" className="btn" onClick={() => navigate('/settings')}>
            {t('backup.backupNow')}
          </button>
        </div>
      )}
    </>
  );
}
