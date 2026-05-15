import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ar, en } from '@/i18n';
import { interpolate, resolvePath } from '@/i18n/resolve';
import type { Locale, TranslationParams, TranslationTree } from '@/i18n/types';

const STORAGE_LOCALE = 'hafezway_admin_locale';

const messages: Record<Locale, TranslationTree> = { en, ar };

export type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
  dir: 'ltr' | 'rtl';
  isRtl: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_LOCALE);
  return stored === 'ar' ? 'ar' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_LOCALE, next);
  }, []);

  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';
  const isRtl = dir === 'rtl';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = useCallback(
    (key: string, params?: TranslationParams) => {
      const raw =
        resolvePath(messages[locale], key) ??
        resolvePath(messages.en, key) ??
        key;
      return interpolate(raw, params);
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, dir, isRtl }),
    [locale, setLocale, t, dir, isRtl],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

/** Shorthand for `useLocale().t` */
export function useT() {
  return useLocale().t;
}
