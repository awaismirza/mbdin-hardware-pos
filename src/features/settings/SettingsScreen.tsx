import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '@/appStore';
import { Screen } from '@/components/app/Screen';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setSettings } from '@/db/repos/settingsRepo';
import { LANGUAGES, type Language } from '@/i18n';
import { cn } from '@/lib/cn';
import {
  installAvailable,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
} from '@/pwa';
import { APP_VERSION, buildDate } from '@/version';
import { DataSection } from './DataSection';
import { PinSection } from './PinSection';

const SHOP_FIELDS = [
  ['shop_name', 'settings.shopName'],
  ['shop_phone', 'settings.shopPhone'],
  ['shop_address', 'settings.shopAddress'],
  ['receipt_footer', 'settings.receiptFooter'],
  ['invoice_prefix', 'settings.invoicePrefix'],
  ['low_stock_default', 'settings.lowStockDefault'],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-panel shadow-card">
      <h2 className="border-b border-line px-4 py-3.5 text-[14.5px] font-bold">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Two real swatches, painted in the actual palette rather than described.
 * A shopkeeper picking a theme at eleven at night should see what they are
 * choosing, not read the word "dark".
 */
function AppearanceCard() {
  const t = useT();
  const language = useLanguage();
  const setLanguage = useApp((state) => state.setLanguage);
  const { theme, setTheme } = useTheme();

  return (
    <Section title={t('settings.appearance')}>
      <div className="flex gap-2.5">
        <button
          type="button"
          aria-pressed={theme === 'light'}
          onClick={() => setTheme('light')}
          className={cn(
            'flex-1 rounded-xl border p-3 text-start',
            theme === 'light' ? 'border-[1.5px] border-brand' : 'border-line',
          )}
          style={{ background: '#f4f5f7', color: '#101623' }}
        >
          <span className="block text-[13px] font-bold">{t('settings.themeLight')}</span>
          <span className="block text-[11px] opacity-70">{t('settings.themeLightHint')}</span>
        </button>
        <button
          type="button"
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme('dark')}
          className={cn(
            'flex-1 rounded-xl border p-3 text-start',
            theme === 'dark' ? 'border-[1.5px] border-brand' : 'border-line',
          )}
          style={{ background: '#0c0f16', color: '#eef1f7' }}
        >
          <span className="block text-[13px] font-bold">{t('settings.themeDark')}</span>
          <span className="block text-[11px] opacity-70">{t('settings.themeDarkHint')}</span>
        </button>
      </div>

      <button
        type="button"
        aria-pressed={theme === 'system'}
        onClick={() => setTheme('system')}
        className={cn(
          'mt-2.5 h-10 w-full rounded-[10px] border text-[12.5px] font-semibold transition-colors',
          theme === 'system'
            ? 'border-[1.5px] border-brand bg-brand-soft text-brand'
            : 'border-line bg-panel2 text-fg2 hover:text-fg',
        )}
      >
        {t('settings.themeSystem')}
      </button>

      <div className="mt-2.5 flex gap-2.5" role="group" aria-label={t('settings.language')}>
        {LANGUAGES.map((code: Language) => (
          <button
            key={code}
            type="button"
            aria-pressed={language === code}
            onClick={() => void setLanguage(code)}
            className={cn(
              'h-[42px] flex-1 rounded-[10px] border font-semibold transition-colors',
              code === 'ur' ? 'text-[15px]' : 'text-[13px]',
              language === code
                ? 'border-[1.5px] border-brand bg-brand-soft text-brand'
                : 'border-line bg-panel2 text-fg2 hover:text-fg',
            )}
          >
            {code === 'ur' ? t('settings.languageUr') : t('settings.languageEn')}
          </button>
        ))}
      </div>
    </Section>
  );
}

export function SettingsScreen() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useApp((state) => state.settings);
  const refreshSettings = useApp((state) => state.refreshSettings);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [canInstall, setCanInstall] = useState(installAvailable());

  useEffect(() => onInstallAvailabilityChange(setCanInstall), []);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [key] of SHOP_FIELDS) next[key] = settings[key] ?? '';
    setDraft(next);
  }, [settings]);

  async function save() {
    await setSettings(draft);
    await refreshSettings();
    toast(t('settings.saved'));
  }

  return (
    <Screen
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      contentClassName="p-4"
    >
      <div className="grid items-start gap-3 xl:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-3">
          <Section title={t('settings.shop')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {SHOP_FIELDS.map(([key, label]) => (
                <label key={key} className="grid gap-1.5">
                  <span className="text-[11.5px] font-semibold text-fg2">{t(label)}</span>
                  <Input
                    className={cn(
                      (key === 'shop_phone' || key === 'low_stock_default') && 'num',
                    )}
                    value={draft[key] ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [key]: event.target.value }))
                    }
                    inputMode={key === 'low_stock_default' ? 'decimal' : undefined}
                    dir={key === 'shop_phone' ? 'ltr' : undefined}
                  />
                </label>
              ))}
              <div className="sm:col-span-2">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => void save()}
                  data-testid="save-settings"
                >
                  {t('action.save')}
                </Button>
              </div>
            </div>
          </Section>

          <AppearanceCard />

          {!isStandalone() && (
            <Section title={t('settings.install')}>
              <div className="grid gap-2">
                <p className="text-[13px] text-fg2">{t('settings.installBody')}</p>
                {canInstall && (
                  <Button className="w-full" onClick={() => void promptInstall()}>
                    {t('install.installNow')}
                  </Button>
                )}
                <Button
                  variant={canInstall ? 'outline' : 'default'}
                  className="w-full"
                  onClick={() => navigate('/install')}
                  data-testid="open-install-guide"
                >
                  {t('install.showMe')}
                </Button>
              </div>
            </Section>
          )}

          <Section title={t('settings.about')}>
            <div data-testid="about">
              <div className="flex items-baseline gap-3 border-b border-line py-2 text-[13px]">
                <span className="flex-1 text-fg2">{t('app.name')}</span>
                <span className="num font-semibold" data-testid="app-version">
                  v{APP_VERSION}
                </span>
              </div>
              {buildDate() && (
                <div className="flex items-baseline gap-3 py-2 text-[13px]">
                  <span className="flex-1 text-fg2">{t('settings.built')}</span>
                  <span className="num font-semibold">{buildDate()}</span>
                </div>
              )}
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-3">
          <PinSection />
          <DataSection />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/settings/storage')}
          >
            {t('settings.storageDebug')}
          </Button>
        </div>
      </div>
    </Screen>
  );
}
