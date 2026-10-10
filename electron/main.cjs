const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const useViteDevServer =
  process.env.NODE_ENV === 'development' && !app.isPackaged;

function getBackupScriptsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'hafezway-backup');
  }
  return path.join(process.cwd(), 'scripts', 'hafezway-backup');
}

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
  const scriptPath = path.join(getBackupScriptsDir(), 'pull-mongo-images-daily.sh');
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

// ---------- Restore-from-backup support ----------

function configsArchiveSearchDirs() {
  const dirs = [
    path.join(process.cwd(), 'backups', 'hafezway-server'),
    path.join(app.getPath('downloads'), 'hafezway-backups'),
    path.join(app.getPath('downloads'), 'hafezway-server'),
  ];
  return dirs.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

ipcMain.handle('admin:list-local-configs-archives', () => {
  const dirs = configsArchiveSearchDirs();
  const out = [];
  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      // Match the names produced by server-backup.sh: configs_YYYY-MM-DD.tar.gz
      // Also accept the broader "configs*.tar.gz" pattern in case of renames.
      if (!/^configs.*\.tar\.gz$/i.test(name)) continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      out.push({
        path: abs,
        fileName: name,
        dir,
        sizeMB: (st.size / (1024 * 1024)).toFixed(2),
        mtime: st.mtime.toISOString().replace('T', ' ').split('.')[0],
        mtimeMs: st.mtimeMs,
      });
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { dirs, archives: out };
});

ipcMain.handle('admin:pick-configs-archive', async () => {
  const candidates = configsArchiveSearchDirs();
  const defaultPath = candidates[0] || app.getPath('downloads');
  const result = await dialog.showOpenDialog({
    title: 'Select a backup archive (configs_*.tar.gz)',
    defaultPath,
    properties: ['openFile'],
    filters: [
      { name: 'Backup archive', extensions: ['tar.gz', 'tgz'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  const filePath = result.filePaths[0];
  let sizeMB = '';
  try {
    sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
  } catch {
    // ignore
  }
  return {
    ok: true,
    canceled: false,
    path: filePath,
    fileName: path.basename(filePath),
    sizeMB,
  };
});

const SAFE_SERVER_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;
const SAFE_OWNER_RE = /^[A-Za-z0-9._-]+$/;
const VALID_ONLY = new Set(['all', 'env', 'nginx']);

ipcMain.handle('admin:run-restore-on-server', async (_evt, rawOpts) => {
  const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
  const archivePath = typeof opts.archivePath === 'string' ? opts.archivePath : '';
  const server = typeof opts.server === 'string' ? opts.server.trim() : '';
  const only = typeof opts.only === 'string' ? opts.only : 'all';
  const dryRun = opts.dryRun === true;
  const noReload = opts.noReload === true;
  const envOwner = typeof opts.envOwner === 'string' ? opts.envOwner.trim() : '';

  if (!archivePath || !fs.existsSync(archivePath)) {
    return { ok: false, error: `Archive not found: ${archivePath}` };
  }
  if (!SAFE_SERVER_RE.test(server)) {
    return { ok: false, error: `Invalid server target. Expected user@host (got: "${server}")` };
  }
  if (!VALID_ONLY.has(only)) {
    return { ok: false, error: `Invalid "only" value: ${only}` };
  }
  if (envOwner && !SAFE_OWNER_RE.test(envOwner)) {
    return { ok: false, error: `Invalid env owner: ${envOwner}` };
  }

  const scriptPath = path.join(getBackupScriptsDir(), 'restore-on-server.sh');
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Restore script not found at ${scriptPath}` };
  }
  let scriptBuffer;
  try {
    scriptBuffer = fs.readFileSync(scriptPath);
  } catch (e) {
    return { ok: false, error: `Could not read script: ${e.message || e}` };
  }

  const { execFile, spawn } = await import('node:child_process');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const remoteInbox = `/tmp/hafezway_restore_inbox_${ts}.tar.gz`;

  const scpResult = await new Promise((resolve) => {
    execFile(
      'scp',
      ['-q', archivePath, `${server}:${remoteInbox}`],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, stdout, stderr, error: stderr || error.message || 'scp failed' });
        } else {
          resolve({ ok: true, stdout, stderr });
        }
      },
    );
  });

  if (!scpResult.ok) {
    return {
      ok: false,
      step: 'scp',
      error: `Upload failed: ${scpResult.error}`,
      stdout: scpResult.stdout || '',
      stderr: scpResult.stderr || '',
    };
  }

  const envParts = [
    `ONLY=${only}`,
    `DRY_RUN=${dryRun ? 1 : 0}`,
    `NO_RELOAD=${noReload ? 1 : 0}`,
  ];
  if (envOwner) envParts.push(`ENV_OWNER=${envOwner}`);

  // Wrap so we always clean the uploaded file, even on failure. The script's
  // exit code is preserved via $? before rm runs.
  const remoteCommand =
    `${envParts.join(' ')} bash -s -- ${remoteInbox}; ` +
    `__rc=$?; rm -f ${remoteInbox} || true; exit $__rc`;

  const sshResult = await new Promise((resolve) => {
    const child = spawn('ssh', [server, remoteCommand], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: err.message || 'ssh failed',
      });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
        error: code === 0 ? undefined : `Restore exited with code ${code}`,
      });
    });
    try {
      child.stdin.write(scriptBuffer);
      child.stdin.end();
    } catch (e) {
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: `Could not pipe script: ${e.message || e}`,
      });
    }
  });

  return {
    ok: sshResult.ok,
    step: sshResult.ok ? 'done' : 'ssh',
    exitCode: sshResult.exitCode,
    stdout: sshResult.stdout,
    stderr: sshResult.stderr,
    error: sshResult.error,
    remoteInbox,
    homeHint: os.homedir(),
  };
});

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../build/icon.png');
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
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

  return win;
}

/** @type {import('electron-updater').AppUpdater | null} */
let autoUpdaterInstance = null;
let updaterWired = false;

function getAutoUpdater() {
  if (!autoUpdaterInstance) {
    ({ autoUpdater: autoUpdaterInstance } = require('electron-updater'));
    autoUpdaterInstance.autoDownload = false;
    autoUpdaterInstance.autoInstallOnAppQuit = true;
  }
  return autoUpdaterInstance;
}

function sendToWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function setupAutoUpdater(win) {
  if (!win) return;

  const currentVersion = app.getVersion();

  // Unpackaged `npm run dev`: show a preview banner so the UI is visible immediately.
  if (!app.isPackaged) {
    const pushPreview = () => {
      if (win.isDestroyed()) return;
      win.webContents.send('admin:update-available', {
        version: '0.2.0',
        currentVersion,
        simulated: true,
      });
    };
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => setTimeout(pushPreview, 800));
    } else {
      setTimeout(pushPreview, 800);
    }
  }

  if (updaterWired) return;
  updaterWired = true;

  ipcMain.handle('admin:get-app-version', () => app.getVersion());

  ipcMain.handle('admin:check-for-updates', async () => {
    if (!app.isPackaged) {
      sendToWindows('admin:update-available', {
        version: '0.2.0',
        currentVersion: app.getVersion(),
        simulated: true,
      });
      return { ok: true, simulated: true };
    }
    try {
      const result = await getAutoUpdater().checkForUpdates();
      return { ok: true, updateInfo: result?.updateInfo ?? null };
    } catch (e) {
      const message = e?.message || String(e);
      sendToWindows('admin:update-error', message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('admin:download-update', async (_event, version) => {
    if (!app.isPackaged) {
      const ver = typeof version === 'string' ? version.trim().replace(/^v/i, '') : '';
      const url = ver
        ? `https://github.com/emkc0078/desktop-hafezWay/releases/download/v${ver}/Hafez-Way-Admin-Setup-${ver}.exe`
        : 'https://github.com/emkc0078/desktop-hafezWay/releases/latest';
      await shell.openExternal(url);
      sendToWindows('admin:update-downloaded', {
        version: ver || 'latest',
        currentVersion: app.getVersion(),
        simulated: true,
        openedExternally: true,
      });
      return { ok: true, opened: true, url };
    }
    try {
      await getAutoUpdater().downloadUpdate();
      return { ok: true };
    } catch (e) {
      const message = e?.message || String(e);
      const ver = typeof version === 'string' ? version.trim().replace(/^v/i, '') : '';
      const url = ver
        ? `https://github.com/emkc0078/desktop-hafezWay/releases/download/v${ver}/Hafez-Way-Admin-Setup-${ver}.exe`
        : 'https://github.com/emkc0078/desktop-hafezWay/releases/latest';
      try {
        await shell.openExternal(url);
        sendToWindows('admin:update-downloaded', {
          version: ver || 'latest',
          currentVersion: app.getVersion(),
          openedExternally: true,
        });
        return { ok: true, opened: true, url };
      } catch {
        sendToWindows('admin:update-error', message);
        return { ok: false, error: message };
      }
    }
  });

  ipcMain.handle('admin:install-update', () => {
    if (!app.isPackaged) return { ok: true, simulated: true };
    getAutoUpdater().quitAndInstall(false, true);
    return { ok: true };
  });

  ipcMain.handle('admin:open-latest-release-page', async (_event, version) => {
    const owner = 'emkc0078';
    const repo = 'desktop-hafezWay';
    const ver = typeof version === 'string' && version.trim() ? version.trim().replace(/^v/i, '') : '';
    const url = ver
      ? `https://github.com/${owner}/${repo}/releases/download/v${ver}/Hafez-Way-Admin-Setup-${ver}.exe`
      : `https://github.com/${owner}/${repo}/releases/latest`;
    await shell.openExternal(url);
    return { ok: true, url };
  });

  if (!app.isPackaged) return;

  const updater = getAutoUpdater();
  updater.on('update-available', (info) => {
    sendToWindows('admin:update-available', {
      version: info.version,
      currentVersion: app.getVersion(),
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    });
  });
  updater.on('download-progress', (progress) => {
    sendToWindows('admin:update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });
  updater.on('update-downloaded', (info) => {
    sendToWindows('admin:update-downloaded', {
      version: info.version,
      currentVersion: app.getVersion(),
    });
  });
  updater.on('error', (err) => {
    sendToWindows('admin:update-error', err?.message || String(err));
  });

  setTimeout(() => {
    updater.checkForUpdates().catch((err) => {
      sendToWindows('admin:update-error', err?.message || String(err));
    });
  }, 4000);
}

app.whenReady().then(() => {
  const win = createWindow();
  setupAutoUpdater(win);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    setupAutoUpdater(win);
  }
});
