import { en, type StringKey, type Strings } from './en';
import { ur } from './ur';

export type { StringKey, Strings };

export type Language = 'ur' | 'en';

export const LANGUAGES: readonly Language[] = ['en', 'ur'];

const BUNDLES: Record<Language, Strings> = { en, ur };

export function isLanguage(value: unknown): value is Language {
  return value === 'ur' || value === 'en';
}

export function direction(language: Language): 'rtl' | 'ltr' {
  return language === 'ur' ? 'rtl' : 'ltr';
}

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

export function translator(language: Language): Translate {
  const bundle = BUNDLES[language];
  return (key, vars) => interpolate(bundle[key], vars);
}

/** "{name} owes {balance}" — no library, no plural rules we do not need. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Picks the name to show for a bilingual record. Either field may be blank —
 * a shop full of Urdu-only names is normal, and so is the reverse.
 */
export function pickName(
  language: Language,
  nameUr: string | null | undefined,
  nameEn: string | null | undefined,
): string {
  const preferred = language === 'ur' ? nameUr : nameEn;
  const other = language === 'ur' ? nameEn : nameUr;
  return (preferred?.trim() || other?.trim()) ?? '';
}
