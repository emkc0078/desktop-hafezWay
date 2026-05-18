import { useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { AdminAuthBar } from '@/components/AdminAuthBar';
import { HttpLogsPanel } from '@/app/logs/HttpLogsPanel';
import { BackupPanel } from '@/app/logs/BackupPanel';
import { RedisPanel } from '@/app/logs/RedisPanel';
import { SocketPanel } from '@/app/logs/SocketPanel';

type Tab = 'logs' | 'backup' | 'redis' | 'socket';

export function LogsViewerPage() {
  const { logsApiBase } = useAdminSettings();
  const t = useT();

  const [tab, setTab] = useState<Tab>('logs');

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: 'logs', labelKey: 'logsPage.tabs.logs' },
    { id: 'backup', labelKey: 'logsPage.tabs.backup' },
    { id: 'redis', labelKey: 'logsPage.tabs.redis' },
    { id: 'socket', labelKey: 'logsPage.tabs.socket' },
  ];

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div
          className={`mx-auto flex w-full flex-col gap-5 ${
            tab === 'logs' ? 'max-w-none' : 'max-w-7xl'
          }`}
        >
          <div>
            <h1 className="text-xl font-semibold">{t('logsPage.title')}</h1>
            <p className="text-sm text-text-muted">
              {t('logsPage.apiLabel')}{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{logsApiBase}</code>
            </p>
          </div>
          <div className="min-w-0 w-full">
            <AdminAuthBar showTestHint />
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-950">
        {tabs.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === id
                ? 'bg-brand-primary text-white'
                : 'bg-white text-text-secondary shadow-sm dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </nav>

      <div
        className={`mx-auto w-full p-4 sm:p-6 ${tab === 'logs' ? 'max-w-none' : 'max-w-7xl'}`}
      >
        {tab === 'logs' && <HttpLogsPanel />}
        {tab === 'backup' && <BackupPanel />}
        {tab === 'redis' && <RedisPanel />}
        {tab === 'socket' && <SocketPanel />}
      </div>
    </div>
  );
}
