import { create } from 'zustand';

import { dbInfo, initDb, reopenDb, type InitResult, type StorageMode } from './db/client';
import { getAllSettings, setSetting, type SettingsMap } from './db/repos/settingsRepo';
import { DEFAULT_SETTINGS } from './db/migrations';
import { direction, isLanguage, translator, type Language, type Translate } from './i18n';

export type BootStatus = 'idle' | 'booting' | 'ready' | 'failed';

export interface Toast {
  id: number;
  message: string;
  tone: 'plain' | 'warn' | 'bad';
}

interface AppState {
  status: BootStatus;
  error: string | null;
  info: InitResult | null;
  settings: SettingsMap;
  language: Language;
  t: Translate;
  toasts: Toast[];
  /** Result of navigator.storage.persist(), or null if never asked. */
  persisted: boolean | null;

  boot(forceMode?: StorageMode): Promise<void>;
  refreshSettings(): Promise<void>;
  setLanguage(language: Language): Promise<void>;
  saveSetting(key: string, value: string): Promise<void>;
  toast(message: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  error: null,
  info: null,
  settings: { ...DEFAULT_SETTINGS },
  language: 'ur',
  t: translator('ur'),
  toasts: [],
  persisted: null,

  async boot(forceMode) {
    set({ status: 'booting', error: null });
    try {
      const info = forceMode ? await reopenDb({ forceMode }) : await initDb();
      const settings = await getAllSettings();
      const language = isLanguage(settings['language']) ? settings['language'] : 'ur';
      applyDocumentLanguage(language);
      set({
        status: 'ready',
        info,
        settings,
        language,
        t: translator(language),
      });
      void requestPersistence().then((persisted) => set({ persisted }));
    } catch (error) {
      set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        info: dbInfo(),
      });
    }
  },

  async refreshSettings() {
    const settings = await getAllSettings();
    const language = isLanguage(settings['language']) ? settings['language'] : get().language;
    applyDocumentLanguage(language);
    set({ settings, language, t: translator(language) });
  },

  async setLanguage(language) {
    applyDocumentLanguage(language);
    set((state) => ({
      language,
      t: translator(language),
      settings: { ...state.settings, language },
    }));
    await setSetting('language', language);
  },

  async saveSetting(key, value) {
    set((state) => ({ settings: { ...state.settings, [key]: value } }));
    await setSetting(key, value);
  },

  toast(message, tone = 'plain') {
    const id = (toastSeq += 1);
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), tone === 'plain' ? 2600 : 5000);
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

/** `lang` and `dir` live on <html> and flip live when the language toggles. */
export function applyDocumentLanguage(language: Language): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = direction(language);
}

/**
 * Ask the browser not to evict the ledger when it wants space back.
 * Chrome grants it silently to installed apps; Safari does not implement it at
 * all, which is precisely why the daily backup reminder exists.
 */
async function requestPersistence(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export function useT(): Translate {
  return useApp((state) => state.t);
}

export function useLanguage(): Language {
  return useApp((state) => state.language);
}

export function useToast(): (message: string, tone?: Toast['tone']) => void {
  return useApp((state) => state.toast);
}
