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
    };
  }
}
