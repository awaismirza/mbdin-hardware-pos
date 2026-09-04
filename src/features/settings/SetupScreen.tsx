import { useState } from 'react';

import { useApp, useLanguage, useT } from '@/appStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setSettings } from '@/db/repos/settingsRepo';
import { LANGUAGES, type Language } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * First run. Setup is complete once the shop has a name, so an existing shop is
 * never sent back through here when the feature ships.
 */
export function SetupScreen() {
  const t = useT();
  const language = useLanguage();
  const setLanguage = useApp((state) => state.setLanguage);
  const refreshSettings = useApp((state) => state.refreshSettings);
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function finish(): Promise<void> {
    if (!shopName.trim()) {
      setError(t('setup.shopNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await setSettings({
        shop_name: shopName.trim(),
        shop_phone: phone.trim(),
        shop_address: address.trim(),
      });
      await refreshSettings();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Spec: one centred 460px card, brand lockup, language pair, form,
          one primary button. Nothing else on the screen. */}
      <Card className="w-full max-w-[460px] gap-0 rounded-[18px] p-6 shadow-sheet">
        <CardHeader className="p-0">
          <span className="mb-4 flex items-center gap-2.5">
            <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand text-[15px] font-extrabold text-on-brand">
              د
            </span>
            <span className="text-[17px] font-extrabold tracking-tight">{t('app.name')}</span>
          </span>
          <h1 className="text-[22px] font-extrabold tracking-tight">{t('setup.title')}</h1>
          <p className="text-[13px] text-fg2">{t('setup.intro')}</p>
        </CardHeader>

        <CardContent className="grid gap-3.5 p-0 pt-4">
          <div className="flex gap-2.5" role="group" aria-label={t('settings.language')}>
            {LANGUAGES.map((code: Language) => (
              <button
                key={code}
                type="button"
                aria-pressed={language === code}
                data-testid={`setup-language-${code}`}
                onClick={() => void setLanguage(code)}
                className={cn(
                  'h-[46px] flex-1 rounded-[11px] border font-semibold transition-colors',
                  code === 'ur' ? 'text-base' : 'text-[13.5px]',
                  language === code
                    ? 'border-[1.5px] border-brand bg-brand-soft text-brand'
                    : 'border-line bg-panel2 text-fg2 hover:text-fg',
                )}
              >
                {code === 'ur' ? t('settings.languageUr') : t('settings.languageEn')}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="setup-shop-name">{t('settings.shopName')}</Label>
            <Input
              id="setup-shop-name"
              className="h-[46px]"
              autoFocus
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              data-testid="setup-shop-name"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="setup-phone">
              {t('settings.shopPhone')} ({t('common.optional')})
            </Label>
            <Input
              id="setup-phone"
              className="num h-[46px]"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="setup-address">
              {t('settings.shopAddress')} ({t('common.optional')})
            </Label>
            <Input
              id="setup-address"
              className="h-[46px]"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>

          <Button
            className="mt-1 w-full"
            size="lg"
            disabled={saving}
            onClick={() => void finish()}
            data-testid="complete-setup"
          >
            {saving ? t('common.saving') : t('setup.start')}
          </Button>
          {error && (
            <p className="text-[13px] font-medium text-bad" role="alert">
              {error}
            </p>
          )}
          <p className="text-center text-[11.5px] text-fg2">{t('setup.installHint')}</p>
        </CardContent>
      </Card>
    </main>
  );
}
