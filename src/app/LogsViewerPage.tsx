import { useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { AdminAuthBar } from '@/components/AdminAuthBar';
import { HttpLogsPanel } from '@/app/logs/HttpLogsPanel';
import { BackupPanel } from '@/app/logs/BackupPanel';
import { RedisPanel } from '@/app/logs/RedisPanel';
import { SocketPanel } from '@/app/logs/SocketPanel';

type Tab = 'logs' | 'backup' | 'redis' | 'socket';

export function LogsViewerPage() {
  const { logsApiBase } = useAdminSettings();

  const [tab, setTab] = useState<Tab>('logs');

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">System & logs</h1>
            <p className="text-sm text-text-muted">
              API: <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{logsApiBase}</code>
            </p>
          </div>
          <AdminAuthBar showTestHint />
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-950">
        {(
          [
            ['logs', 'HTTP logs'],
            ['backup', 'Backup'],
            ['redis', 'Redis'],
            ['socket', 'Socket.IO'],
          ] as const
        ).map(([id, label]) => (
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
            {label}
          </button>
        ))}
      </nav>

      <div className="mx-auto max-w-7xl p-6">
        {tab === 'logs' && <HttpLogsPanel />}
        {tab === 'backup' && <BackupPanel />}
        {tab === 'redis' && <RedisPanel />}
        {tab === 'socket' && <SocketPanel />}
      </div>
    </div>
  );
}
