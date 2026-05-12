const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const useViteDevServer =
  process.env.NODE_ENV === 'development' && !app.isPackaged;

ipcMain.handle('admin:get-downloads-path', () => app.getPath('downloads'));

ipcMain.handle('admin:open-downloads-folder', async () => {
  const folderPath = app.getPath('downloads');
  const err = await shell.openPath(folderPath);
  return { ok: !err, error: err || null, path: folderPath };
});

function getLocalBackupsDir() {
  return path.join(app.getPath('downloads'), 'hafezway-backups');
}

ipcMain.handle('admin:get-local-backups-path', () => getLocalBackupsDir());

ipcMain.handle('admin:open-local-backups-folder', async () => {
  const folderPath = getLocalBackupsDir();
  const err = await shell.openPath(folderPath);
  return { ok: !err, error: err || null, path: folderPath };
});

ipcMain.handle('admin:list-local-backups', async () => {
  const dir = getLocalBackupsDir();
  if (!fs.existsSync(dir)) return { dir, mongo: [], images: [] };

  const files = fs.readdirSync(dir);
  const mongo = [];
  const images = [];

  for (const fileName of files) {
    const abs = path.join(dir, fileName);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    const createdAt = st.birthtime
      ? st.birthtime.toISOString().replace('T', ' ').split('.')[0]
      : '';
    const sizeMB = (st.size / (1024 * 1024)).toFixed(2);

    if (fileName.endsWith('.gz')) {
      mongo.push({ fileName, createdAt, sizeMB });
    } else if (fileName.startsWith('images-backup-') && fileName.endsWith('.zip')) {
      images.push({ fileName, createdAt, sizeMB });
    }
  }

  // ISO date strings sort lexicographically (YYYY-MM-DD ...)
  mongo.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  images.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { dir, mongo, images };
});

ipcMain.handle('admin:run-local-mongo-images-pull', async () => {
  const scriptPath = path.join(process.cwd(), 'scripts', 'hafezway-backup', 'pull-mongo-images-daily.sh');
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Script not found: ${scriptPath}` };
  }

  // Lazy-load so it doesn't affect bundling in dev.
  const { execFile } = await import('node:child_process');
  return await new Promise((resolve) => {
    execFile('bash', [scriptPath], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: stderr || error.message || 'Pull failed', stdout, stderr });
        return;
      }
      resolve({ ok: true, stdout, stderr });
    });
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'Hafez Way Admin',
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  if (useViteDevServer) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
