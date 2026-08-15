import { useLocale } from '@/context/LocaleContext';
import type { Locale } from '@/i18n/types';

const OPTIONS: { value: Locale; short: string }[] = [
  { value: 'en', short: 'EN' },
  { value: 'ar', short: 'AR' },
];

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className={`inline-flex rounded-lg border border-gray-300 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-800 ${className}`}
      role="group"
      aria-label={t('language.label')}
    >
      {OPTIONS.map((opt) => {
        const active = locale === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLocale(opt.value)}
            aria-pressed={active}
            aria-label={opt.value === 'en' ? t('language.en') : t('language.ar')}
            className={`min-w-[2.5rem] rounded-md px-2.5 py-1.5 text-sm font-semibold transition ${
              active
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}
