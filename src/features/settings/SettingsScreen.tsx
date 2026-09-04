import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '@/appStore';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setSettings } from '@/db/repos/settingsRepo';
import { LANGUAGES, type Language } from '@/i18n';
import { cn } from '@/lib/cn';
import {
  installAvailable,
  isIosSafari,
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
    <section className="border-b p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsScreen() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useApp((state) => state.settings);
  const setLanguage = useApp((state) => state.setLanguage);
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
    <Screen title={t('settings.title')}>
      <Section title={t('settings.shop')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHOP_FIELDS.map(([key, label]) => (
            <label key={key} className="grid gap-2">
              <span className="text-sm font-medium">{t(label)}</span>
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
            <Button onClick={() => void save()} data-testid="save-settings">
              {t('action.save')}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={t('settings.language')}>
        <div className="inline-flex rounded-lg border p-1" role="group" aria-label={t('settings.language')}>
          {LANGUAGES.map((code: Language) => (
            <button
              key={code}
              type="button"
              aria-pressed={language === code}
              onClick={() => void setLanguage(code)}
              className={cn(
                'min-w-24 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                language === code
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {code === 'ur' ? t('settings.languageUr') : t('settings.languageEn')}
            </button>
          ))}
        </div>
      </Section>

      {!isStandalone() && (
        <Section title={t('settings.install')}>
          <div className="grid gap-2">
            {canInstall && (
              <Button className="w-full" onClick={() => void promptInstall()}>
                {t('settings.installAndroid')}
              </Button>
            )}
            {isIosSafari() && (
              <p className="text-sm text-muted-foreground">{t('settings.installIos')}</p>
            )}
          </div>
        </Section>
      )}

      <PinSection />

      <DataSection />

      <div className="p-4">
        <Button variant="outline" className="w-full" onClick={() => navigate('/settings/storage')}>
          {t('settings.storageDebug')}
        </Button>
      </div>

      <Section title={t('settings.about')}>
        <div className="divide-y" data-testid="about">
          <div className="flex items-baseline gap-3 py-2 text-sm">
            <span className="flex-1 text-muted-foreground">{t('app.name')}</span>
            <span className="num font-medium" data-testid="app-version">
              v{APP_VERSION}
            </span>
          </div>
          {buildDate() && (
            <div className="flex items-baseline gap-3 py-2 text-sm">
              <span className="flex-1 text-muted-foreground">{t('settings.built')}</span>
              <span className="num">{buildDate()}</span>
            </div>
          )}
        </div>
      </Section>
    </Screen>
  );
}
