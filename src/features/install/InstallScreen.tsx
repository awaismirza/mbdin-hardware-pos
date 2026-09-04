import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  AppWindow,
  Download,
  HardDrive,
  MonitorSmartphone,
  Share,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react';

import { useApp, useT } from '@/appStore';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  installAvailable,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
} from '@/pwa';
import { GUIDE_STEPS, PLATFORM_TITLE, detectPlatform, type Platform } from './platform';

/**
 * "Put Dukaan on the home screen", written once, for whichever device is
 * actually asking.
 *
 * On Chromium this is a single button — the browser hands us the prompt and we
 * fire it. Everywhere else it is a short numbered list, because the gesture
 * belongs to the browser chrome and no amount of script can reach it. The iOS
 * case is the one that matters most: a home-screen app is exempt from Safari's
 * seven-day eviction of script-writable storage, so on an iPhone this screen is
 * the difference between a ledger that survives and one that quietly does not.
 */
export function InstallScreen() {
  const t = useT();
  const navigate = useNavigate();
  const persisted = useApp((state) => state.persisted);

  const [platform] = useState<Platform>(() => detectPlatform());
  const [canPrompt, setCanPrompt] = useState(installAvailable());
  const [installed, setInstalled] = useState(isStandalone());
  const [busy, setBusy] = useState(false);

  useEffect(() => onInstallAvailabilityChange(setCanPrompt), []);

  // `appinstalled` fires after the browser's own dialog completes; re-reading
  // display-mode is the only reliable confirmation on the platforms that have
  // no event at all.
  useEffect(() => {
    const check = () => setInstalled(isStandalone());
    window.addEventListener('appinstalled', check);
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', check);
    return () => {
      window.removeEventListener('appinstalled', check);
      media.removeEventListener('change', check);
    };
  }, []);

  const steps = GUIDE_STEPS[platform];

  return (
    <Screen
      title={t('install.title')}
      subtitle={t('install.subtitle')}
      onBack={() => navigate(-1)}
      contentClassName="p-4"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3">
        {installed ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-ok/30 bg-ok-soft p-4 text-ok">
            <Check className="size-5 shrink-0" />
            <div>
              <p className="text-[14.5px] font-bold">{t('install.alreadyInstalled')}</p>
              <p className="text-[12.5px] opacity-80">{t('install.alreadyInstalledBody')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Why this matters, before how to do it. */}
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Benefit icon={HardDrive} title={t('install.why.storage')} />
              <Benefit icon={WifiOff} title={t('install.why.offline')} />
              <Benefit icon={MonitorSmartphone} title={t('install.why.fullscreen')} />
            </div>

            {canPrompt ? (
              <div className="rounded-[14px] border border-line bg-panel p-4 shadow-card">
                <p className="text-[14.5px] font-bold">{t('install.oneTapTitle')}</p>
                <p className="mt-1 mb-3 text-[13px] text-fg2">{t('install.oneTapBody')}</p>
                <Button
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  data-testid="install-now"
                  onClick={() => {
                    setBusy(true);
                    void promptInstall().finally(() => setBusy(false));
                  }}
                >
                  <Download className="size-4" /> {t('install.installNow')}
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] border border-line bg-panel shadow-card">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
                  <PlatformIcon platform={platform} />
                  <span className="text-[14.5px] font-bold">{t(PLATFORM_TITLE[platform] as never)}</span>
                </div>
                {steps.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-fg2">{t('install.unsupportedBody')}</p>
                ) : (
                  <ol className="flex flex-col">
                    {steps.map((key, index) => (
                      <li
                        key={key}
                        className="flex items-start gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
                      >
                        <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[11.5px] font-bold text-brand">
                          {index + 1}
                        </span>
                        <span className="text-[13.5px] leading-relaxed">{t(key as never)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </>
        )}

        {/* Where the ledger actually lives, in plain words. */}
        <div className="rounded-[14px] border border-line bg-panel p-4 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="size-4 text-fg2" />
            <span className="text-[14.5px] font-bold">{t('install.storageTitle')}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-fg2">{t('install.storageBody')}</p>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={cn(
                'size-2 rounded-full',
                persisted === true ? 'bg-ok' : persisted === false ? 'bg-warn' : 'bg-fg2',
              )}
            />
            <span className="text-[12.5px] font-medium" data-testid="install-persist-state">
              {persisted === true
                ? t('install.persistGranted')
                : persisted === false
                  ? t('install.persistDenied')
                  : t('install.persistUnknown')}
            </span>
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => navigate('/settings')}
          >
            {t('install.backUpNow')}
          </Button>
        </div>
      </div>
    </Screen>
  );
}

function Benefit({
  icon: Icon,
  title,
}: {
  icon: typeof HardDrive;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel p-3 shadow-card">
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <span className="text-[12.5px] font-semibold leading-tight">{title}</span>
    </div>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  const Icon =
    platform === 'ios-safari' || platform === 'desktop-safari'
      ? Share
      : platform === 'android' || platform === 'ios-other'
        ? Smartphone
        : AppWindow;
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-panel2 text-fg2">
      <Icon className="size-4" />
    </span>
  );
}
