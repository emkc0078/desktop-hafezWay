export {};

declare global {
  interface Window {
    hafezwayAdmin?: {
      getDownloadsPath: () => Promise<string>;
      openDownloadsFolder: () => Promise<{ ok: boolean; error: string | null; path: string }>;
      getLocalBackupsPath: () => Promise<string>;
      listLocalBackups: () => Promise<{ dir: string; mongo: Array<{ fileName: string; createdAt: string; sizeMB: string }>; images: Array<{ fileName: string; createdAt: string; sizeMB: string }> }>;
      openLocalBackupsFolder: () => Promise<{ ok: boolean; error: string | null; path: string }>;
      runLocalMongoImagesPull: () => Promise<{ ok: boolean; error?: string; stdout?: string; stderr?: string }>;
    };
  }
}
