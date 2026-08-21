import { useState } from 'react';
import { useT } from '@/context/LocaleContext';
import { AdminAuthBar } from '@/components/AdminAuthBar';
import { TeacherFinancePanel } from '@/components/TeacherFinancePanel';
import { StudentFinancePanel } from '@/components/StudentFinancePanel';

type FinanceSection = 'teachers' | 'students';

export function FinancePage() {
  const t = useT();
  const [section, setSection] = useState<FinanceSection>('teachers');

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <div>
            <h1 className="text-xl font-semibold text-text-primary dark:text-gray-100">
              {t('nav.finance')}
            </h1>
            <p className="text-sm text-text-muted dark:text-gray-400">
              {t('financePage.subtitle')}
            </p>
          </div>
          <div className="min-w-0 w-full">
            <AdminAuthBar />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
        <div
          className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700"
          role="tablist"
          aria-label={t('nav.finance')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'teachers'}
            className={
              section === 'teachers'
                ? 'rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white'
                : 'rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }
            onClick={() => setSection('teachers')}
          >
            {t('financePage.sectionTeachers')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'students'}
            className={
              section === 'students'
                ? 'rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white'
                : 'rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }
            onClick={() => setSection('students')}
          >
            {t('financePage.sectionStudents')}
          </button>
        </div>

        <div className={section === 'teachers' ? 'block' : 'hidden'}>
          <TeacherFinancePanel active={section === 'teachers'} />
        </div>
        <div className={section === 'students' ? 'block' : 'hidden'}>
          <StudentFinancePanel active={section === 'students'} />
        </div>
      </div>
    </div>
  );
}
