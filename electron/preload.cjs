const { contextBridge, ipcRenderer } = require('electron');

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
});
