import { useLanguage } from '@/appStore';
import { direction } from '@/i18n';

/** 'rtl' when the app is in Urdu, 'ltr' otherwise. */
export function useDirection(): 'rtl' | 'ltr' {
  return direction(useLanguage());
}
