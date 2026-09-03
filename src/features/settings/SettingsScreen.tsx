import { useNavigate } from 'react-router-dom';

import { useApp, useLanguage, useT } from '../../appStore';
import { LANGUAGES, type Language } from '../../i18n';

/** Shop details and the Data section arrive in M5. Language and the storage
 *  check are here from M1 because both are needed to verify the shell. */
export function SettingsScreen() {
  const t = useT();
  const language = useLanguage();
  const setLanguage = useApp((state) => state.setLanguage);
  const info = useApp((state) => state.info);
  const navigate = useNavigate();

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('settings.title')}</h1>
      </div>

      <div className="screen__body">
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

        <div className="section-head">{t('settings.data')}</div>
        <div className="kv">
          <span className="kv__key">{t('settings.storageMode')}</span>
          <span className="kv__value">
            {info?.mode === 'opfs' ? t('settings.storageOpfs') : t('settings.storageIdb')}
          </span>
        </div>
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
