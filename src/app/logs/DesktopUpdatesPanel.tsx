import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { Btn, Card, MessageBanner } from '@/components/ui';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import {
  desktopUpdatesApiBase,
  syncDesktopUpdateToServer,
  versionShareUrl,
  type DesktopUpdateMirrorStatus,
  type DesktopUpdateVersionRow,
} from '@/utils/desktopUpdates';
import { downloadInstallerWithProgress } from '@/utils/downloadWithProgress';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DesktopUpdatesPanel() {
  const t = useT();
  const { serverUrl, adminToken } = useAdminSettings();
  const [status, setStatus] = useState<DesktopUpdateMirrorStatus | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedVersion, setCopiedVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    version: string;
    percent: number;
    transferred: number;
    total: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${desktopUpdatesApiBase(serverUrl)}/status`, {
        headers: { Authorization: `admin ${adminToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        message?: string;
        data?: DesktopUpdateMirrorStatus;
      };
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setStatus(json.data ?? null);
      setMessage(null);
    } catch (error) {
      if (isAdminSessionExpiredError(error)) return;
      setMessage({
        text: error instanceof Error ? error.message : t('desktopUpdates.loadFailed'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, serverUrl, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = useCallback(
    async (row: DesktopUpdateVersionRow) => {
      try {
        const link = versionShareUrl(serverUrl, row);
        await navigator.clipboard.writeText(link);
        setCopiedVersion(row.version);
        setMessage({ text: t('desktopUpdates.linkCopied'), type: 'success' });
        window.setTimeout(() => setCopiedVersion(null), 2000);
      } catch {
        setMessage({ text: t('desktopUpdates.copyFailed'), type: 'error' });
      }
    },
    [serverUrl, t],
  );

  const syncLatest = useCallback(async () => {
    if (!adminToken) return;
    setSyncing(true);
    setMessage(null);
    try {
      const data = await syncDesktopUpdateToServer(serverUrl, adminToken);
      setStatus(data);
      setMessage({
        text: t('desktopUpdates.syncOk', { version: data?.version || '?' }),
        type: 'success',
      });
      await load();
    } catch (error) {
      if (isAdminSessionExpiredError(error)) return;
      setMessage({
        text: error instanceof Error ? error.message : t('desktopUpdates.syncFailed'),
        type: 'error',
      });
    } finally {
      setSyncing(false);
    }
  }, [adminToken, load, serverUrl, t]);

  const downloadRow = useCallback(
    async (row: DesktopUpdateVersionRow) => {
      setMessage(null);
      setDownloadProgress({
        version: row.version,
        percent: 0,
        transferred: 0,
        total: row.bytes,
      });
      try {
        await downloadInstallerWithProgress({
          url: row.setupUrl,
          fileName: row.setupFile,
          onProgress: (progress) => {
            setDownloadProgress({
              version: row.version,
              percent: progress.percent,
              transferred: progress.transferred,
              total: progress.total || row.bytes,
            });
          },
        });
        setMessage({
          text: t('desktopUpdates.downloadDone', { version: row.version }),
          type: 'success',
        });
      } catch (error) {
        setMessage({
          text: error instanceof Error ? error.message : t('desktopUpdates.downloadFailed'),
          type: 'error',
        });
      } finally {
        setDownloadProgress(null);
      }
    },
    [t],
  );

  if (!adminToken) {
    return <p className="text-sm text-text-muted">{t('desktopUpdates.signIn')}</p>;
  }

  const versions = status?.versions ?? [];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
            {t('desktopUpdates.title')}
          </h2>
          <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
            {t('desktopUpdates.hint', { keep: String(status?.keepCount ?? 4) })}
          </p>
          {status?.dir ? (
            <p className="mt-1 text-xs text-text-muted">
              {t('desktopUpdates.dir')}: {status.dir}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" disabled={loading || syncing} onClick={() => void load()}>
            {t('desktopUpdates.refresh')}
          </Btn>
          <Btn variant="success" disabled={loading || syncing} onClick={() => void syncLatest()}>
            {syncing ? t('desktopUpdates.syncing') : t('desktopUpdates.syncLatest')}
          </Btn>
        </div>
      </div>

      {message ? (
        <div className="mb-4">
          <MessageBanner type={message.type} text={message.text} onDismiss={() => setMessage(null)} />
        </div>
      ) : null}

      {downloadProgress ? (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
          <p className="text-sm font-medium text-sky-950 dark:text-sky-50">
            {t('desktopUpdates.downloading', {
              version: downloadProgress.version,
              percent: String(Math.round(downloadProgress.percent)),
            })}
          </p>
          <p className="mt-1 text-xs text-sky-900/80 dark:text-sky-100/80">
            {formatBytes(downloadProgress.transferred)} /{' '}
            {formatBytes(downloadProgress.total || downloadProgress.transferred || 1)}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
            <div
              className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-400"
              style={{ width: `${Math.min(100, Math.max(0, downloadProgress.percent))}%` }}
            />
          </div>
        </div>
      ) : null}

      {versions.length === 0 ? (
        <p className="text-sm text-text-muted">
          {loading ? t('desktopUpdates.loading') : t('desktopUpdates.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-text-muted dark:border-gray-700">
                <th className="px-2 py-2 font-medium">{t('desktopUpdates.colVersion')}</th>
                <th className="px-2 py-2 font-medium">{t('desktopUpdates.colSize')}</th>
                <th className="px-2 py-2 font-medium">{t('desktopUpdates.colDate')}</th>
                <th className="px-2 py-2 font-medium">{t('desktopUpdates.colLink')}</th>
                <th className="px-2 py-2 font-medium">{t('desktopUpdates.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((row) => (
                <tr
                  key={row.version}
                  className="border-b border-gray-100 dark:border-gray-800"
                >
                  <td className="px-2 py-2 font-medium text-text-primary dark:text-gray-100">
                    v{row.version}
                    {row.isLatest ? (
                      <span className="ms-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        {t('desktopUpdates.latest')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-text-secondary">{formatBytes(row.bytes)}</td>
                  <td className="px-2 py-2 text-text-secondary">{formatDate(row.updatedAt)}</td>
                  <td
                    className="max-w-[18rem] truncate px-2 py-2 font-mono text-xs text-text-muted"
                    title={versionShareUrl(serverUrl, row)}
                  >
                    {versionShareUrl(serverUrl, row)}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Btn
                        variant="secondary"
                        onClick={() => void copyLink(row)}
                      >
                        {copiedVersion === row.version
                          ? t('desktopUpdates.copied')
                          : t('desktopUpdates.copyLink')}
                      </Btn>
                      <Btn
                        variant="info"
                        disabled={Boolean(downloadProgress)}
                        onClick={() => void downloadRow(row)}
                      >
                        {downloadProgress?.version === row.version
                          ? t('desktopUpdates.downloadingShort', {
                              percent: String(Math.round(downloadProgress.percent)),
                            })
                          : t('desktopUpdates.download')}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
