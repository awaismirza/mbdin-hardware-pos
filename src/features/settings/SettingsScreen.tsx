import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '../../appStore';
import { setSettings } from '../../db/repos/settingsRepo';
import { LANGUAGES, type Language } from '../../i18n';
import { installAvailable, isIosSafari, isStandalone, onInstallAvailabilityChange, promptInstall } from '../../pwa';
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
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('settings.title')}</h1>
      </div>

      <div className="screen__body">
        <div className="section-head">{t('settings.shop')}</div>
        <div className="form-grid">
          {SHOP_FIELDS.map(([key, label]) => (
            <label key={key} className="field">
              <span className="field__label">{t(label)}</span>
              <input
                className={`input${key === 'shop_phone' || key === 'low_stock_default' ? ' num' : ''}`}
                value={draft[key] ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                }
                inputMode={key === 'low_stock_default' ? 'decimal' : undefined}
                dir={key === 'shop_phone' ? 'ltr' : undefined}
              />
            </label>
          ))}
          <div className="form-grid__wide">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void save()}
              data-testid="save-settings"
            >
              {t('action.save')}
            </button>
          </div>
        </div>

        <div className="section-head">{t('settings.language')}</div>
        <div className="screen__pad">
          <div className="segmented" role="group" aria-label={t('settings.language')}>
            {LANGUAGES.map((code: Language) => (
              <button
                key={code}
                type="button"
                className="segmented__item"
                aria-pressed={language === code}
                onClick={() => void setLanguage(code)}
              >
                {code === 'ur' ? t('settings.languageUr') : t('settings.languageEn')}
              </button>
            ))}
          </div>
        </div>

        {!isStandalone() && (
          <>
            <div className="section-head">{t('settings.install')}</div>
            <div className="screen__pad stack">
              {canInstall && (
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={() => void promptInstall()}
                >
                  {t('settings.installAndroid')}
                </button>
              )}
              {isIosSafari() && <p className="field__hint">{t('settings.installIos')}</p>}
            </div>
          </>
        )}

        <PinSection />

        <DataSection />

        <div className="screen__pad">
          <button
            type="button"
            className="btn btn--block"
            onClick={() => navigate('/settings/storage')}
          >
            {t('settings.storageDebug')}
          </button>
        </div>
      </div>
    </div>
  );
}
