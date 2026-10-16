/** Server-mirrored desktop admin installers (backed by GitHub, served from hafezway). */

export type DesktopUpdateMirrorStatus = {
  version: string | null;
  ready: boolean;
  setupFile: string | null;
  setupUrl: string | null;
  latestYmlUrl: string | null;
  publicBase: string;
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
