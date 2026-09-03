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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="text-sm font-semibold text-primary">{t('app.name')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('setup.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('setup.intro')}</p>
        </CardHeader>

        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label>{t('settings.language')}</Label>
            <div
              className="inline-flex rounded-lg border p-1"
              role="group"
              aria-label={t('settings.language')}
            >
              {LANGUAGES.map((code: Language) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={language === code}
                  data-testid={`setup-language-${code}`}
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
          </div>

          <div className="grid gap-4">
            <p className="text-sm font-semibold">{t('setup.shopDetails')}</p>
            <div className="grid gap-2">
              <Label htmlFor="setup-shop-name">{t('settings.shopName')}</Label>
              <Input
                id="setup-shop-name"
                autoFocus
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                data-testid="setup-shop-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setup-phone">
                {t('settings.shopPhone')} ({t('common.optional')})
              </Label>
              <Input
                id="setup-phone"
                className="num"
                dir="ltr"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setup-address">
                {t('settings.shopAddress')} ({t('common.optional')})
              </Label>
              <Input
                id="setup-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={saving}
            onClick={() => void finish()}
            data-testid="complete-setup"
          >
            {saving ? t('common.saving') : t('setup.start')}
          </Button>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
