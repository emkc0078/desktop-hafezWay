import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { Btn } from '@/components/ui';
import {
  resolveMirroredInstaller,
  syncDesktopUpdateToServer,
} from '@/utils/desktopUpdates';
import { downloadInstallerWithProgress } from '@/utils/downloadWithProgress';

type UpdateInfo = {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
  simulated?: boolean;
  /** Installer was handed to the browser because this app build cannot install in place. */
  openedExternally?: boolean;
};

type DownloadProgressState = {
  percent: number;
  transferred: number;
  total: number;
};

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; progress: DownloadProgressState }
  | { kind: 'downloaded'; info: UpdateInfo }
  | { kind: 'error'; message: string; info?: UpdateInfo };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UpdateProgressBar({
  version,
  progress,
  compact,
}: {
  version: string;
  progress: DownloadProgressState;
  compact?: boolean;
}) {
  const t = useT();
  const percent = Math.round(progress.percent);
  return (
    <div
      className={
        compact
          ? 'min-w-[15rem] max-w-xs rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 shadow-sm dark:border-sky-800 dark:bg-sky-950/70'
          : 'max-w-lg rounded-lg border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900 dark:bg-sky-950/40'
      }
      role="status"
      aria-live="polite"
    >
      <p
        className={`font-medium text-sky-950 dark:text-sky-50 ${compact ? 'text-xs' : 'text-sm'}`}
      >
        {t('update.downloadingTitle', { version, percent: String(percent) })}
      </p>
      <p className={`text-sky-900/80 dark:text-sky-100/80 ${compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'}`}>
        {formatBytes(progress.transferred)} /{' '}
        {formatBytes(progress.total || progress.transferred || 1)}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
        <div
          className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-400"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

type AppUpdateContextValue = {
  status: UpdateStatus;
  info: UpdateInfo | undefined;
  dismissBanner: () => void;
  bannerDismissed: boolean;
  download: () => Promise<void>;
  install: () => void;
  openReleasePage: () => void;
};

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

function useAppUpdate(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used within AppUpdateProvider');
  return ctx;
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const bridge = typeof window !== 'undefined' ? window.hafezwayAdmin : undefined;
  const { serverUrl, adminToken } = useAdminSettings();
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [downloadedFilePath, setDownloadedFilePath] = useState<string | null>(null);
  const syncedVersionRef = useRef<string | null>(null);

  const mirrorToServer = useCallback(
    async (version: string) => {
      if (!adminToken || !version || syncedVersionRef.current === version) return;
      try {
        await syncDesktopUpdateToServer(serverUrl, adminToken, version);
        syncedVersionRef.current = version;
      } catch {
        /* download() retries sync; banner still shows the available update */
      }
    },
    [adminToken, serverUrl],
  );

  const downloadInstaller = useCallback(
    async (
      setupUrl: string,
      setupFile: string,
      onProgress?: (progress: DownloadProgressState) => void,
    ) => {
      return await downloadInstallerWithProgress({
        url: setupUrl,
        fileName: setupFile,
        onProgress: (progress) =>
          onProgress?.({
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
          }),
      });
    },
    [],
  );

  useEffect(() => {
    if (!bridge?.onUpdateAvailable) {
      if (import.meta.env.DEV) {
        setStatus({
          kind: 'available',
          info: {
            version: 'dev',
            currentVersion: 'dev',
            simulated: true,
          },
        });
      }
      return;
    }

    const offAvailable = bridge.onUpdateAvailable((info) => {
      setDismissedVersion(null);
      setStatus((prev) => {
        if (prev.kind === 'downloading' || prev.kind === 'downloaded') return prev;
        return { kind: 'available', info };
      });
      if (!info.simulated) void mirrorToServer(info.version);
    });
    const offProgress = bridge.onUpdateDownloadProgress?.((p) => {
      setStatus((prev) => {
        const info =
          prev.kind === 'available' || prev.kind === 'downloading' || prev.kind === 'downloaded'
            ? prev.info
            : { version: '?', currentVersion: '?' };
        return {
          kind: 'downloading',
          info,
          progress: {
            percent: p.percent,
            transferred: p.transferred ?? 0,
            total: p.total ?? 0,
          },
        };
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
      /* banner and header button appear only when an update is available */
    });

    return () => {
      offAvailable?.();
      offProgress?.();
      offDownloaded?.();
      offError?.();
    };
  }, [bridge, mirrorToServer]);

  useEffect(() => {
    if (status.kind !== 'available' || status.info.simulated || !adminToken) return;
    void mirrorToServer(status.info.version);
  }, [adminToken, mirrorToServer, status]);

  const info =
    status.kind === 'available' ||
    status.kind === 'downloading' ||
    status.kind === 'downloaded' ||
    status.kind === 'error'
      ? status.info
      : undefined;

  const download = useCallback(async () => {
    if (!info) return;
    setStatus({
      kind: 'downloading',
      info,
      progress: { percent: 0, transferred: 0, total: 0 },
    });
    try {
      // Always resolve against the server mirror. Dev preview versions (e.g. 0.1.23 / 0.2.0)
      // are not real files — sync/fetch the latest mirrored installer instead.
      const mirrored = await resolveMirroredInstaller({
        serverUrl,
        adminToken,
        preferredVersion: info.version,
        useLatest: Boolean(info.simulated),
      });
      syncedVersionRef.current = mirrored.version;
      const downloadInfo: UpdateInfo = {
        ...info,
        version: mirrored.version,
      };
      setStatus({
        kind: 'downloading',
        info: downloadInfo,
        progress: { percent: 0, transferred: 0, total: mirrored.bytes },
      });
      const dlResult = await downloadInstaller(mirrored.setupUrl, mirrored.setupFile, (progress) => {
        setStatus({ kind: 'downloading', info: downloadInfo, progress });
      });
      if (dlResult.path) {
        setDownloadedFilePath(dlResult.path);
      }
      setStatus({
        kind: 'downloaded',
        info: { ...downloadInfo, openedExternally: dlResult.mode === 'browser' },
      });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message, info });
    }
  }, [adminToken, downloadInstaller, info, serverUrl]);

  const install = useCallback(async () => {
    if (!info) return;
    if (downloadedFilePath && bridge?.launchInstallerAndQuit) {
      const res = await bridge.launchInstallerAndQuit(downloadedFilePath);
      if (res.ok) return;
    }
    if (bridge?.installUpdate && !info.openedExternally) {
      void bridge.installUpdate();
      return;
    }
    if (bridge?.openDownloadsFolder) {
      await bridge.openDownloadsFolder();
      return;
    }
    void download();
  }, [bridge, download, downloadedFilePath, info]);

  const openReleasePage = useCallback(() => {
    if (!info?.version) return;
    void download();
  }, [download, info?.version]);

  const dismissBanner = useCallback(() => {
    if (info) setDismissedVersion(info.version);
  }, [info]);

  const value = useMemo(
    () => ({
      status,
      info,
      dismissBanner,
      bannerDismissed: Boolean(info && dismissedVersion === info.version),
      download,
      install,
      openReleasePage,
    }),
    [status, info, dismissBanner, dismissedVersion, download, install, openReleasePage],
  );

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function AppUpdateBanner() {
  const t = useT();
  const { status, info, bannerDismissed, download, install, openReleasePage, dismissBanner } =
    useAppUpdate();

  if (
    !info ||
    status.kind === 'idle' ||
    (bannerDismissed && status.kind === 'available')
  ) {
    return null;
  }

  return (
    <div
      className="border-b border-sky-300 bg-sky-50 px-4 py-3 text-sky-950 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-50"
      role="status"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rtl-flip-row">
        <div className="min-w-0 flex-1 space-y-1">
          {status.kind === 'downloading' ? (
            <UpdateProgressBar version={info.version} progress={status.progress} />
          ) : (
            <>
              <p className="text-sm font-semibold">
                {status.kind === 'downloaded'
                  ? t('update.readyTitle', { version: info.version })
                  : t('update.availableTitle', { version: info.version })}
              </p>
              <p className="text-xs text-sky-900/80 dark:text-sky-100/80">
                {status.kind === 'error'
                  ? t('update.downloadFailed', { message: status.message })
                  : t('update.availableBody', {
                      current: info.currentVersion,
                      latest: info.version,
                    })}
                {status.kind !== 'error' && info.simulated ? ` ${t('update.devPreview')}` : ''}
              </p>
            </>
          )}
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
            <Btn type="button" variant="secondary" onClick={dismissBanner}>
              {t('common.dismiss')}
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Header control that swaps label and color until the user downloads or installs. */
export function AppUpdateHeaderButton() {
  const t = useT();
  const { status, info, download, install } = useAppUpdate();
  const [flip, setFlip] = useState(false);
  const toggling = status.kind === 'available' || status.kind === 'error' || status.kind === 'downloaded';

  useEffect(() => {
    if (!toggling) return;
    const id = window.setInterval(() => setFlip((value) => !value), 700);
    return () => window.clearInterval(id);
  }, [toggling]);

  if (!info || status.kind === 'idle') return null;

  if (status.kind === 'downloading') {
    return <UpdateProgressBar version={info.version} progress={status.progress} compact />;
  }

  const installing = status.kind === 'downloaded';
  const opened = Boolean(info.openedExternally);
  const label = installing
    ? opened
      ? flip
        ? t('update.headerOpenAgain')
        : t('update.headerOpened')
      : flip
        ? t('update.headerInstall')
        : t('update.readyTitle', { version: info.version })
    : flip
      ? t('update.headerClick')
      : t('update.headerNew', { version: info.version });

  return (
    <button
      type="button"
      onClick={() => {
        if (installing) install();
        else void download();
      }}
      className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-bold shadow-md transition-colors duration-300 ${
        flip
          ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-200'
          : 'bg-red-600 text-white ring-2 ring-red-300'
      }`}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
