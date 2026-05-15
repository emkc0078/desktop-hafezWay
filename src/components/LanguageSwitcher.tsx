import { useLocale } from '@/context/LocaleContext';
import type { Locale } from '@/i18n/types';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  const options: { value: Locale; label: string }[] = [
    { value: 'en', label: t('language.en') },
    { value: 'ar', label: t('language.ar') },
  ];

  return (
    <label
      className={`inline-flex items-center gap-2 text-sm text-text-secondary dark:text-gray-300 ${className}`}
    >
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        aria-label={t('language.label')}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
