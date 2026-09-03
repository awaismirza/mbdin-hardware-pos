import { useState } from 'react';

import { useApp, useLanguage, useT } from '../../appStore';
import { setSettings } from '../../db/repos/settingsRepo';
import { LANGUAGES, type Language } from '../../i18n';

/** Initial setup is complete once the shop has a name. Existing shops therefore
 * never get sent back through onboarding when this feature is introduced. */
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
    <main className="setup">
      <section className="setup__card" aria-labelledby="setup-title">
        <div className="setup__brand">{t('app.name')}</div>
        <h1 className="setup__title" id="setup-title">{t('setup.title')}</h1>
        <p className="setup__intro">{t('setup.intro')}</p>

        <div className="field">
          <span className="field__label">{t('settings.language')}</span>
          <div className="segmented" role="group" aria-label={t('settings.language')}>
            {LANGUAGES.map((code: Language) => (
              <button
                key={code}
                type="button"
                className="segmented__item"
                aria-pressed={language === code}
                data-testid={`setup-language-${code}`}
                onClick={() => void setLanguage(code)}
              >
                {code === 'ur' ? t('settings.languageUr') : t('settings.languageEn')}
              </button>
            ))}
          </div>
        </div>

        <div className="setup__fields">
          <div className="section-head">{t('setup.shopDetails')}</div>
          <label className="field">
            <span className="field__label">{t('settings.shopName')}</span>
            <input
              className="input"
              autoFocus
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              data-testid="setup-shop-name"
            />
          </label>
          <label className="field">
            <span className="field__label">{t('settings.shopPhone')} ({t('common.optional')})</span>
            <input className="input num" value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" />
          </label>
          <label className="field">
            <span className="field__label">{t('settings.shopAddress')} ({t('common.optional')})</span>
            <input className="input" value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
        </div>

        <button type="button" className="btn btn--primary btn--block" disabled={saving} onClick={() => void finish()} data-testid="complete-setup">
          {saving ? t('common.saving') : t('setup.start')}
        </button>
        {error && <p className="setup__error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
