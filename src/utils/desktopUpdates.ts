/** Server-mirrored desktop admin installers (backed by GitHub, served from hafezway). */

export type DesktopUpdateVersionRow = {
  version: string;
  setupFile: string;
  setupUrl: string;
  /** HTML page with progress bar — preferred for copy / share. */
  shareUrl?: string;
  bytes: number;
  updatedAt: string;
  isLatest: boolean;
};

export type DesktopUpdateMirrorStatus = {
  version: string | null;
  ready: boolean;
  setupFile: string | null;
  setupUrl: string | null;
  shareUrl?: string | null;
  latestYmlUrl: string | null;
  publicBase: string;
  shareBase?: string;
  versions?: DesktopUpdateVersionRow[];
  keepCount?: number;
  dir?: string;
  syncing?: boolean;
  lastError?: string | null;
};

export function normalizeUpdateVersion(version?: string): string {
  return (version || '').trim().replace(/^v/i, '');
}

export function desktopUpdatesApiBase(serverUrl: string): string {
  return `${serverUrl.replace(/\/$/, '')}/api/desktop-updates`;
}

export function installerDownloadUrl(serverUrl: string, version?: string): string {
  const ver = normalizeUpdateVersion(version);
  const base = desktopUpdatesApiBase(serverUrl);
  if (!ver) return `${base}/files/latest.yml`;
  return `${base}/files/Hafez-Way-Admin-Setup-${ver}.exe`;
}

/** Shareable browser page (progress bar + completion notice). */
export function installerShareUrl(serverUrl: string, versionOrFile?: string): string {
  const base = desktopUpdatesApiBase(serverUrl);
  const raw = (versionOrFile || '').trim();
  if (!raw) return `${base}/download/`;
  if (/\.exe$/i.test(raw)) return `${base}/download/${raw}`;
  const ver = normalizeUpdateVersion(raw);
  return `${base}/download/Hafez-Way-Admin-Setup-${ver}.exe`;
}

export function versionShareUrl(
  serverUrl: string,
  row: Pick<DesktopUpdateVersionRow, 'setupFile' | 'shareUrl' | 'version'>,
): string {
  if (row.shareUrl) return row.shareUrl;
  return installerShareUrl(serverUrl, row.setupFile || row.version);
}

export async function fetchDesktopUpdatesStatus(
  serverUrl: string,
  adminToken?: string,
): Promise<DesktopUpdateMirrorStatus | null> {
  const headers: Record<string, string> = {};
  if (adminToken) headers.Authorization = `admin ${adminToken}`;
  const res = await fetch(`${desktopUpdatesApiBase(serverUrl)}/status`, {
    headers,
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    data?: DesktopUpdateMirrorStatus;
  };
  if (!res.ok) {
    throw new Error(json.message || `Status failed (${res.status})`);
  }
  return json.data ?? null;
}

export async function syncDesktopUpdateToServer(
  serverUrl: string,
  adminToken: string | undefined,
  version?: string,
): Promise<DesktopUpdateMirrorStatus | null> {
  if (!adminToken) return null;
  const ver = normalizeUpdateVersion(version);
  const res = await fetch(`${desktopUpdatesApiBase(serverUrl)}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `admin ${adminToken}`,
    },
    body: JSON.stringify(ver ? { version: ver } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    data?: DesktopUpdateMirrorStatus;
  };
  if (!res.ok) {
    throw new Error(json.message || `Sync failed (${res.status})`);
  }
  return json.data ?? null;
}

/** Resolve a real mirrored installer URL (sync when possible; never invent a missing version). */
export async function resolveMirroredInstaller(options: {
  serverUrl: string;
  adminToken?: string;
  /** Prefer this version when syncing; omit / empty = latest GitHub release. */
  preferredVersion?: string;
  /** When true (dev preview), always sync/download latest on the server. */
  useLatest?: boolean;
}): Promise<{
  version: string;
  setupFile: string;
  setupUrl: string;
  bytes: number;
}> {
  const preferred = normalizeUpdateVersion(options.preferredVersion);
  let mirror: DesktopUpdateMirrorStatus | null = null;
  let syncError: Error | null = null;

  if (options.adminToken) {
    try {
      mirror = await syncDesktopUpdateToServer(
        options.serverUrl,
        options.adminToken,
        options.useLatest ? undefined : preferred || undefined,
      );
    } catch (error) {
      syncError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (!mirror?.setupUrl || !mirror.setupFile) {
    try {
      mirror = await fetchDesktopUpdatesStatus(options.serverUrl, options.adminToken);
    } catch (error) {
      if (syncError) throw syncError;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  if (!mirror?.setupUrl || !mirror.setupFile || !mirror.version) {
    throw syncError || new Error('No installer is mirrored on the server yet.');
  }

  // If a specific version was requested but only another copy exists, still download what we have
  // when useLatest / after failed pin — callers update the banner version to match.
  return {
    version: mirror.version,
    setupFile: mirror.setupFile,
    setupUrl: mirror.setupUrl,
    bytes: mirror.versions?.find((v) => v.version === mirror?.version)?.bytes ?? 0,
  };
}
