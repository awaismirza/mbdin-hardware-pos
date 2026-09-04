import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, X } from 'lucide-react';

import { useApp, useT } from '@/appStore';
import { Button } from '@/components/ui/button';
import { karachiDay } from '@/lib/dates';
import {
  installAvailable,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
} from '@/pwa';
import { detectPlatform } from './platform';

/** Setting key holding the Karachi day the prompt was last dismissed on. */
export const INSTALL_SNOOZED = 'install_prompt_snoozed_day';

/**
 * The nudge that appears when Dukaan is running in a browser tab.
 *
 * It offers the one-tap install where the browser supports it and otherwise
 * sends the shopkeeper to the guide. Dismissal is a snooze, not a mute: it
 * comes back the next day, because a browser tab really can lose the ledger and
 * "no thanks" today should not be a permanent answer. It never appears once the
 * app is on the home screen.
 */
export function InstallPrompt() {
  const t = useT();
  const navigate = useNavigate();
  const status = useApp((state) => state.status);
  const settings = useApp((state) => state.settings);
  const saveSetting = useApp((state) => state.saveSetting);

  const [canPrompt, setCanPrompt] = useState(installAvailable());
  const [installed, setInstalled] = useState(isStandalone());
  const [busy, setBusy] = useState(false);

  useEffect(() => onInstallAvailabilityChange(setCanPrompt), []);

  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  if (status !== 'ready' || installed) return null;
  if (settings[INSTALL_SNOOZED] === karachiDay()) return null;

  const platform = detectPlatform();
  // Chrome-on-iOS cannot install at all; the guide's honest answer there is
  // "open this in Safari", which is worth a banner, not a one-tap button.
  const oneTap = canPrompt && platform !== 'ios-other';

  return (
    <div
      data-testid="install-prompt"
      className="flex shrink-0 items-center gap-2.5 border-b border-line bg-brand-soft px-3 py-2 text-brand md:px-4"
      role="status"
    >
      <Download className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
        {t('install.promptText')}
      </span>
      <Button
        size="sm"
        className="shrink-0"
        disabled={busy}
        data-testid="install-prompt-action"
        onClick={() => {
          if (!oneTap) {
            navigate('/install');
            return;
          }
          setBusy(true);
          void promptInstall().finally(() => setBusy(false));
        }}
      >
        {oneTap ? t('install.installNow') : t('install.showMe')}
      </Button>
      <Button
        size="icon-sm"
        variant="muted"
        className="shrink-0 text-brand hover:bg-brand/10"
        aria-label={t('backup.dismiss')}
        onClick={() => void saveSetting(INSTALL_SNOOZED, karachiDay())}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
