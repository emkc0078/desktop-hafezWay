import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useT } from '@/context/LocaleContext';
import { Btn } from '@/components/ui';

type UpdateInfo = {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
  simulated?: boolean;
  /** Installer was handed to the browser because this app build cannot install in place. */
  openedExternally?: boolean;
};

function installerDownloadUrl(version?: string): string {
  const ver = (version || '').trim().replace(/^v/i, '');
  const base = 'https://github.com/emkc0078/desktop-hafezWay/releases';
  if (!ver) return `${base}/latest`;
  return `${base}/download/v${ver}/Hafez-Way-Admin-Setup-${ver}.exe`;
}

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
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge?.onUpdateAvailable) {
      if (import.meta.env.DEV) {
        setStatus({
          kind: 'available',
          info: { version: '0.1.21', currentVersion: '0.1.20', simulated: true },
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
  }, [bridge]);

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
      if (bridge?.downloadUpdate && !info.simulated) {
        const result = await bridge.downloadUpdate(info.version);
        if (result && result.ok === false) {
          setStatus({ kind: 'error', message: result.error || 'Download failed', info });
        }
        return;
      }
      const url = installerDownloadUrl(info.version);
      if (bridge?.openLatestReleasePage) {
        await bridge.openLatestReleasePage(info.version);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setStatus({
        kind: 'downloaded',
        info: { ...info, openedExternally: true },
      });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message, info });
    }
  }, [bridge, info]);

  const install = useCallback(() => {
    if (!info) return;
    if (info.simulated || info.openedExternally) {
      const url = installerDownloadUrl(info.version);
      if (bridge?.openLatestReleasePage) void bridge.openLatestReleasePage(info.version);
      else window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!bridge?.installUpdate) return;
    void bridge.installUpdate();
  }, [bridge, info]);

  const openReleasePage = useCallback(() => {
    void bridge?.openLatestReleasePage?.(info?.version);
  }, [bridge, info?.version]);

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
