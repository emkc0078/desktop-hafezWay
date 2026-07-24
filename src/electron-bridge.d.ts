export {};

export type LocalConfigsArchive = {
  path: string;
  fileName: string;
  dir: string;
  sizeMB: string;
  mtime: string;
  mtimeMs: number;
};

export type ListLocalConfigsArchivesResult = {
  dirs: string[];
  archives: LocalConfigsArchive[];
};

export type PickConfigsArchiveResult =
  | { ok: true; canceled: false; path: string; fileName: string; sizeMB: string }
  | { ok: false; canceled: true };

export type RestoreOnServerOptions = {
  archivePath: string;
  server: string;
  only: 'all' | 'env' | 'nginx';
  dryRun: boolean;
  noReload: boolean;
  envOwner?: string;
};

export type RestoreOnServerResult = {
  ok: boolean;
  step?: 'scp' | 'ssh' | 'done';
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  remoteInbox?: string;
  homeHint?: string;
};

export type AppUpdateInfo = {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
  simulated?: boolean;
};

export type AppUpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

declare global {
  interface Window {
    hafezwayAdmin?: {
      getDownloadsPath: () => Promise<string>;
      openDownloadsFolder: () => Promise<{ ok: boolean; error: string | null; path: string }>;
      getLocalBackupsPath: () => Promise<string>;
      listLocalBackups: () => Promise<{
        dir: string;
        mongo: Array<{ fileName: string; createdAt: string; sizeMB: string }>;
        images: Array<{ fileName: string; createdAt: string; sizeMB: string }>;
      }>;
      openLocalBackupsFolder: () => Promise<{ ok: boolean; error: string | null; path: string }>;
      runLocalMongoImagesPull: () => Promise<{
        ok: boolean;
        error?: string;
        stdout?: string;
        stderr?: string;
      }>;
      listLocalConfigsArchives: () => Promise<ListLocalConfigsArchivesResult>;
      pickConfigsArchive: () => Promise<PickConfigsArchiveResult>;
      runRestoreOnServer: (opts: RestoreOnServerOptions) => Promise<RestoreOnServerResult>;

      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{ ok: boolean; simulated?: boolean; error?: string; updateInfo?: unknown }>;
      downloadUpdate: () => Promise<{ ok: boolean; simulated?: boolean; error?: string }>;
      installUpdate: () => Promise<{ ok: boolean; simulated?: boolean }>;
      onUpdateAvailable: (listener: (info: AppUpdateInfo) => void) => () => void;
      onUpdateDownloadProgress: (listener: (progress: AppUpdateProgress) => void) => () => void;
      onUpdateDownloaded: (listener: (info: AppUpdateInfo) => void) => () => void;
      onUpdateError: (listener: (message: string) => void) => () => void;
    };
  }
}
