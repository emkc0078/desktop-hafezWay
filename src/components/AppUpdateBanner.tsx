import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/context/LocaleContext';
import { Btn } from '@/components/ui';

type UpdateInfo = {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
  simulated?: boolean;
};

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; percent: number }
  | { kind: 'downloaded'; info: UpdateInfo }
  | { kind: 'error'; message: string; info?: UpdateInfo };

export function AppUpdateBanner() {
  const t = useT();
  const bridge = typeof window !== 'undefined' ? window.hafezwayAdmin : undefined;
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge?.onUpdateAvailable) return;

    const offAvailable = bridge.onUpdateAvailable((info) => {
      setStatus({ kind: 'available', info });
    });
    const offProgress = bridge.onUpdateDownloadProgress?.((p) => {
      setStatus((prev) => {
        const info =
          prev.kind === 'available' || prev.kind === 'downloading' || prev.kind === 'downloaded'
            ? prev.info
            : { version: '?', currentVersion: '?' };
        return { kind: 'downloading', info, percent: p.percent };
      });
    });
    const offDownloaded = bridge.onUpdateDownloaded?.((info) => {
      setStatus({ kind: 'downloaded', info });
    });
    const offError = bridge.onUpdateError?.((message) => {
      setStatus((prev) => ({
        kind: 'error',
        message,
        info:
          prev.kind === 'available' || prev.kind === 'downloading' || prev.kind === 'downloaded'
            ? prev.info
            : undefined,
      }));
    });

    void bridge.checkForUpdates?.().catch(() => {
      /* ignore — banner only appears on update-available */
    });

    return () => {
      offAvailable?.();
      offProgress?.();
      offDownloaded?.();
      offError?.();
    };
  }, [bridge]);

  const info =
    status.kind === 'available' ||
    status.kind === 'downloading' ||
    status.kind === 'downloaded' ||
    status.kind === 'error'
      ? status.info
      : undefined;

  const hidden =
    status.kind === 'idle' ||
    (info && dismissedVersion === info.version && status.kind === 'available');

  const download = useCallback(async () => {
    if (!bridge?.downloadUpdate || !info) return;
    if (info.simulated) {
      setStatus({ kind: 'downloaded', info });
      return;
    }
    setStatus({ kind: 'downloading', info, percent: 0 });
    try {
      await bridge.downloadUpdate();
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message, info });
    }
  }, [bridge, info]);

  const install = useCallback(() => {
    if (!bridge?.installUpdate || !info) return;
    if (info.simulated) {
      setStatus({ kind: 'idle' });
      return;
    }
    void bridge.installUpdate();
  }, [bridge, info]);

  const openReleasePage = useCallback(() => {
    void bridge?.openLatestReleasePage?.();
  }, [bridge]);

  if (hidden || !info) return null;

  const percent = status.kind === 'downloading' ? Math.round(status.percent) : 0;

  return (
    <div
      className="border-b border-sky-300 bg-sky-50 px-4 py-3 text-sky-950 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-50"
      role="status"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rtl-flip-row">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">
            {status.kind === 'downloaded'
              ? t('update.readyTitle', { version: info.version })
              : status.kind === 'downloading'
                ? t('update.downloadingTitle', { version: info.version, percent: String(percent) })
                : t('update.availableTitle', { version: info.version })}
          </p>
          <p className="text-xs text-sky-900/80 dark:text-sky-100/80">
            {t('update.availableBody', {
              current: info.currentVersion,
              latest: info.version,
            })}
            {info.simulated ? ` ${t('update.devPreview')}` : ''}
            {status.kind === 'error' ? ` ${status.message}` : ''}
          </p>
          {status.kind === 'downloading' ? (
            <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
              <div
                className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-400"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 rtl-flip-row">
          {status.kind === 'available' || status.kind === 'error' ? (
            <Btn type="button" variant="info" onClick={() => void download()}>
              {t('update.download')}
            </Btn>
          ) : null}
          {status.kind === 'downloaded' ? (
            <Btn type="button" variant="success" onClick={install}>
              {t('update.installRestart')}
            </Btn>
          ) : null}
          {status.kind === 'available' || status.kind === 'error' || status.kind === 'downloaded' ? (
            <Btn type="button" variant="secondary" onClick={openReleasePage}>
              {t('update.openReleasePage')}
            </Btn>
          ) : null}
          {status.kind === 'available' || status.kind === 'error' ? (
            <Btn
              type="button"
              variant="secondary"
              onClick={() => {
                setDismissedVersion(info.version);
                setStatus({ kind: 'idle' });
              }}
            >
              {t('common.dismiss')}
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}
