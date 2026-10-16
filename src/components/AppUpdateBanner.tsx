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
  installerDownloadUrl,
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

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; percent: number }
  | { kind: 'downloaded'; info: UpdateInfo }
  | { kind: 'error'; message: string; info?: UpdateInfo };

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
    async (version: string, onPercent?: (percent: number) => void) => {
      const ver = version.trim().replace(/^v/i, '');
      const fileName = `Hafez-Way-Admin-Setup-${ver}.exe`;
      const url = installerDownloadUrl(serverUrl, ver);
      await downloadInstallerWithProgress({
        url,
        fileName,
        onProgress: (progress) => onPercent?.(progress.percent),
      });
      return url;
    },
    [serverUrl],
  );

  useEffect(() => {
    if (!bridge?.onUpdateAvailable) {
      if (import.meta.env.DEV) {
        setStatus({
          kind: 'available',
          info: { version: '0.1.23', currentVersion: '0.1.22', simulated: true },
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
    setStatus({ kind: 'downloading', info, percent: 0 });
    try {
      if (!info.simulated) {
        if (!adminToken) {
          throw new Error(
            'Sign in as admin so the server can download the installer from GitHub, then try again.',
          );
        }
        await syncDesktopUpdateToServer(serverUrl, adminToken, info.version);
        syncedVersionRef.current = info.version;
      }
      await downloadInstaller(info.version, (percent) => {
        setStatus({ kind: 'downloading', info, percent });
      });
      setStatus({
        kind: 'downloaded',
        info: { ...info, openedExternally: true },
      });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message, info });
    }
  }, [adminToken, downloadInstaller, info, serverUrl]);

  const install = useCallback(() => {
    if (!info) return;
    if (info.simulated || info.openedExternally) {
      void downloadInstaller(info.version);
      return;
    }
    if (!bridge?.installUpdate) return;
    void bridge.installUpdate();
  }, [bridge, downloadInstaller, info]);

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
    const percent = Math.round(status.percent);
    return (
      <span className="inline-flex items-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white">
        {t('update.downloadingTitle', { version: info.version, percent: String(percent) })}
      </span>
    );
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
