export type DownloadProgress = {
  percent: number;
  transferred: number;
  total: number;
};

function triggerBrowserSave(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

/** Browser fetch with progress; saves via a temporary download link. */
export async function downloadViaBrowser(
  url: string,
  fileName: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body) {
    const blob = await res.blob();
    onProgress?.({ percent: 100, transferred: blob.size, total: blob.size || total });
    triggerBrowserSave(blob, fileName);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let transferred = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      transferred += value.byteLength;
      const percent = total > 0 ? Math.min(100, (transferred / total) * 100) : 0;
      onProgress?.({ percent, transferred, total });
    }
  }
  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
  onProgress?.({ percent: 100, transferred: blob.size, total: total || blob.size });
  triggerBrowserSave(blob, fileName);
}

export async function downloadInstallerWithProgress(options: {
  url: string;
  fileName: string;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<{ mode: 'electron' | 'browser'; path?: string }> {
  const bridge = typeof window !== 'undefined' ? window.hafezwayAdmin : undefined;
  if (bridge?.downloadFileToDownloads) {
    const off = bridge.onFileDownloadProgress?.((progress) => {
      if (progress.fileName !== options.fileName) return;
      options.onProgress?.({
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });
    try {
      const result = await bridge.downloadFileToDownloads(options.url, options.fileName);
      if (!result.ok) {
        throw new Error(result.error || 'Download failed');
      }
      return { mode: 'electron', path: result.path };
    } finally {
      off?.();
    }
  }
  await downloadViaBrowser(options.url, options.fileName, options.onProgress);
  return { mode: 'browser' };
}
