const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('hafezwayAdmin', {
  getDownloadsPath: () => ipcRenderer.invoke('admin:get-downloads-path'),
  openDownloadsFolder: () => ipcRenderer.invoke('admin:open-downloads-folder'),
  getLocalBackupsPath: () => ipcRenderer.invoke('admin:get-local-backups-path'),
  listLocalBackups: () => ipcRenderer.invoke('admin:list-local-backups'),
  openLocalBackupsFolder: () => ipcRenderer.invoke('admin:open-local-backups-folder'),
  runLocalMongoImagesPull: () => ipcRenderer.invoke('admin:run-local-mongo-images-pull'),
  listLocalConfigsArchives: () => ipcRenderer.invoke('admin:list-local-configs-archives'),
  pickConfigsArchive: () => ipcRenderer.invoke('admin:pick-configs-archive'),
  runRestoreOnServer: (opts) => ipcRenderer.invoke('admin:run-restore-on-server', opts),

  getAppVersion: () => ipcRenderer.invoke('admin:get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('admin:check-for-updates'),
  downloadUpdate: (version) => ipcRenderer.invoke('admin:download-update', version),
  installUpdate: () => ipcRenderer.invoke('admin:install-update'),
  openLatestReleasePage: (version) => ipcRenderer.invoke('admin:open-latest-release-page', version),
  openExternalUrl: (url) => ipcRenderer.invoke('admin:open-external-url', url),
  downloadFileToDownloads: (url, fileName) =>
    ipcRenderer.invoke('admin:download-file', url, fileName),
  onFileDownloadProgress: (listener) => subscribe('admin:file-download-progress', listener),
  onUpdateAvailable: (listener) => subscribe('admin:update-available', listener),
  onUpdateDownloadProgress: (listener) => subscribe('admin:update-download-progress', listener),
  onUpdateDownloaded: (listener) => subscribe('admin:update-downloaded', listener),
  onUpdateError: (listener) => subscribe('admin:update-error', listener),
});
