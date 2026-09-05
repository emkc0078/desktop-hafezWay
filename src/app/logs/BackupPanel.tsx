import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { RestoreBackupPanel } from '@/components/RestoreBackupPanel';
import {
  Btn,
  Card,
  Field,
  Input,
  MessageBanner,
  Modal,
  Select,
  TableShell,
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';
import { adminFetchJson, adminFetchResponse } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';

type MessageType = 'success' | 'error' | 'info';

type DestinationMode = 'saveServer' | 'saveServerAndLocal';

type ConfigKind = 'nginx' | 'env' | 'both' | 'migrate';

type BackupPathProbe = {
  id: string;
  path: string;
  exists: boolean;
  readable: boolean;
  isFile: boolean;
  isDir: boolean;
};

type EnvPushTarget = 'backend' | 'frontend' | 'both';

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type BackupFileRow = {
  fileName: string;
  sizeMB: string;
  createdAt: string;
  dbName?: string;
};

type ConfigLocations = {
  backupDir: string;
  nginxPath: string;
  nginxExists: boolean;
  nginxIsFile: boolean;
  backendEnvPath: string;
  backendEnvExists: boolean;
  backendEnvExplicit: boolean;
  frontendEnvPath: string | null;
  frontendEnvConfigured: boolean;
  frontendEnvExists: boolean;
  frontendEnvProductionPath: string | null;
  frontendEnvProductionExists: boolean;
  extraPaths?: BackupPathProbe[];
};

type CleanupStats = {
  totalFiles: number;
  oldFiles: number;
  totalSize: string;
  oldFilesSize: string;
  nextCleanup: string;
};

type AutoStats = {
  enabled: boolean;
  schedule: string;
  nextBackup: string;
  databaseName: string;
};

type LocalBackupsList = {
  dir: string;
  mongo: Array<{ fileName: string; createdAt: string; sizeMB: string }>;
  images: Array<{ fileName: string; createdAt: string; sizeMB: string }>;
};

type EnvPushRow = { id: string; key: string; value: string };

type ConfirmAction =
  | { kind: 'mongo-restore'; fileName: string; dbName: string }
  | { kind: 'images-restore'; fileName: string }
  | { kind: 'mongo-delete'; fileName: string }
  | { kind: 'images-delete'; fileName: string }
  | { kind: 'config-delete'; fileName: string }
  | { kind: 'cleanup' }
  | { kind: 'auto' }
  | { kind: 'pull' }
  | { kind: 'env-push'; target: EnvPushTarget; entries: { key: string; value: string }[] };

function basenameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? filePath;
}

function nextRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function downloadBackupBlob(url: string, adminToken: string, fileName: string): Promise<void> {
  const response = await adminFetchResponse(url, adminToken);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function PathStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
      {label}
    </span>
  );
}

export function BackupPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const backupBase = `${logsApiBase}/backup`;
  const bridge = typeof window !== 'undefined' ? window.hafezwayAdmin : undefined;

  const [destination, setDestination] = useState<DestinationMode>('saveServer');
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [downloadsPath, setDownloadsPath] = useState<string | null>(null);
  const [localBackups, setLocalBackups] = useState<LocalBackupsList | null>(null);
  const [localBackupsPath, setLocalBackupsPath] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const [configLocations, setConfigLocations] = useState<ConfigLocations | null>(null);
  const [configZips, setConfigZips] = useState<BackupFileRow[]>([]);

  const [mongoDatabases, setMongoDatabases] = useState<string[]>([]);
  const [mongoDbName, setMongoDbName] = useState('');
  const [mongoBackups, setMongoBackups] = useState<BackupFileRow[]>([]);

  const [imagesBackups, setImagesBackups] = useState<BackupFileRow[]>([]);

  const [historyAll, setHistoryAll] = useState<string[]>([]);
  const [historyMongo, setHistoryMongo] = useState<string[]>([]);
  const [historyImages, setHistoryImages] = useState<string[]>([]);
  const [cleanupStats, setCleanupStats] = useState<CleanupStats | null>(null);
  const [autoStats, setAutoStats] = useState<AutoStats | null>(null);

  const [envPushTarget, setEnvPushTarget] = useState<EnvPushTarget>('backend');
  const [envRows, setEnvRows] = useState<EnvPushRow[]>([{ id: nextRowId(), key: '', value: '' }]);

  const showMessage = useCallback((text: string, type: MessageType = 'info') => {
    setMessage({ text, type });
  }, []);

  const handleError = useCallback(
    (error: unknown, fallback?: string) => {
      if (isAdminSessionExpiredError(error)) return;
      showMessage(error instanceof Error ? error.message : fallback ?? t('common.error'), 'error');
    },
    [showMessage, t],
  );

  const shouldDownload = destination === 'saveServerAndLocal';

  const loadLocalSection = useCallback(async () => {
    if (bridge?.getLocalBackupsPath) {
      try {
        const path = await bridge.getLocalBackupsPath();
        setLocalBackupsPath(path);
      } catch {
        setLocalBackupsPath(null);
      }
    }
    if (bridge?.getDownloadsPath) {
      try {
        const path = await bridge.getDownloadsPath();
        setDownloadsPath(path);
      } catch {
        setDownloadsPath(null);
      }
    }
    if (bridge?.listLocalBackups) {
      try {
        const list = await bridge.listLocalBackups();
        setLocalBackups(list);
      } catch (e) {
        handleError(e);
      }
    }
  }, [bridge, handleError]);

  const loadConfigSection = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [locationsRes, listRes] = await Promise.all([
        adminFetchJson<ApiEnvelope<ConfigLocations>>(`${backupBase}/config/locations`, adminToken),
        adminFetchJson<ApiEnvelope<BackupFileRow[]>>(`${backupBase}/config/list`, adminToken),
      ]);
      setConfigLocations(locationsRes.data ?? null);
      setConfigZips(listRes.data ?? []);
    } catch (e) {
      handleError(e);
      setConfigLocations(null);
      setConfigZips([]);
    }
  }, [adminToken, backupBase, handleError]);

  const loadMongoSection = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [dbRes, listRes] = await Promise.all([
        adminFetchJson<ApiEnvelope<string[]>>(`${backupBase}/mongo/databases`, adminToken),
        adminFetchJson<ApiEnvelope<BackupFileRow[]>>(`${backupBase}/mongo/list`, adminToken),
      ]);
      const names = dbRes.data ?? [];
      setMongoDatabases(names);
      setMongoBackups(listRes.data ?? []);
      if (names.length > 0) {
        setMongoDbName((prev) => (prev.trim() ? prev : names[0]));
      }
    } catch (e) {
      handleError(e);
      setMongoDatabases([]);
      setMongoBackups([]);
    }
  }, [adminToken, backupBase, handleError]);

  const loadImagesSection = useCallback(async () => {
    if (!adminToken) return;
    try {
      const listRes = await adminFetchJson<ApiEnvelope<BackupFileRow[]>>(
        `${backupBase}/images/list`,
        adminToken,
      );
      setImagesBackups(listRes.data ?? []);
    } catch (e) {
      handleError(e);
      setImagesBackups([]);
    }
  }, [adminToken, backupBase, handleError]);

  const loadHistorySection = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [allRes, mongoRes, imagesRes, cleanupRes, autoRes] = await Promise.all([
        adminFetchJson<ApiEnvelope<string[]>>(`${backupBase}/history`, adminToken),
        adminFetchJson<ApiEnvelope<string[]>>(`${backupBase}/history/mongo`, adminToken),
        adminFetchJson<ApiEnvelope<string[]>>(`${backupBase}/history/images`, adminToken),
        adminFetchJson<ApiEnvelope<CleanupStats>>(`${backupBase}/cleanup/stats`, adminToken),
        adminFetchJson<ApiEnvelope<AutoStats>>(`${backupBase}/auto/stats`, adminToken),
      ]);
      setHistoryAll(allRes.data ?? []);
      setHistoryMongo(mongoRes.data ?? []);
      setHistoryImages(imagesRes.data ?? []);
      setCleanupStats(cleanupRes.data ?? null);
      setAutoStats(autoRes.data ?? null);
    } catch (e) {
      handleError(e);
    }
  }, [adminToken, backupBase, handleError]);

  const refreshAll = useCallback(async () => {
    setBusy('refresh');
    try {
      await Promise.all([
        loadLocalSection(),
        adminToken ? loadConfigSection() : Promise.resolve(),
        adminToken ? loadMongoSection() : Promise.resolve(),
        adminToken ? loadImagesSection() : Promise.resolve(),
        adminToken ? loadHistorySection() : Promise.resolve(),
      ]);
    } finally {
      setBusy(null);
    }
  }, [
    adminToken,
    loadConfigSection,
    loadHistorySection,
    loadImagesSection,
    loadLocalSection,
    loadMongoSection,
  ]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const downloadExisting = useCallback(
    async (kind: 'mongo' | 'images' | 'config', fileName: string) => {
      if (!adminToken) {
        showMessage(t('backup.signInConfig'), 'error');
        return;
      }
      setBusy(`download-${fileName}`);
      try {
        await downloadBackupBlob(`${backupBase}/${kind}/download/${encodeURIComponent(fileName)}`, adminToken, fileName);
        showMessage(t('backup.downloaded', { fileName }), 'success');
      } catch (e) {
        handleError(e, t('backup.downloadFailed'));
      } finally {
        setBusy(null);
      }
    },
    [adminToken, backupBase, handleError, showMessage, t],
  );

  const createConfigBackup = useCallback(
    async (kind: ConfigKind, withDownload: boolean) => {
      if (!adminToken) {
        showMessage(t('backup.signInConfig'), 'error');
        return;
      }
      setBusy(`config-create-${kind}`);
      try {
        const res = await adminFetchJson<
          ApiEnvelope<{ fileName: string; size?: number; included?: number; skipped?: number }>
        >(`${backupBase}/config/create`, adminToken, {
          method: 'POST',
          body: JSON.stringify({ kind }),
        });
        const fileName = res.data?.fileName;
        const included = res.data?.included;
        const skipped = res.data?.skipped;
        await loadConfigSection();
        const counts =
          included != null
            ? t('backup.configCounts', {
                included: String(included),
                skipped: String(skipped ?? 0),
              })
            : '';
        if (withDownload && fileName) {
          await downloadBackupBlob(
            `${backupBase}/config/download/${encodeURIComponent(fileName)}`,
            adminToken,
            fileName,
          );
          showMessage(
            counts
              ? t('backup.configDownloadedCounts', { fileName, counts })
              : t('backup.configDownloaded', { fileName }),
            'success',
          );
        } else if (fileName) {
          showMessage(
            counts
              ? t('backup.configCreatedCounts', { fileName, counts })
              : t('backup.configCreated', { fileName }),
            'success',
          );
        } else {
          showMessage(t('backup.couldNotCreateConfig'), 'error');
        }
      } catch (e) {
        handleError(e, t('backup.couldNotCreateConfig'));
      } finally {
        setBusy(null);
      }
    },
    [adminToken, backupBase, handleError, loadConfigSection, showMessage, t],
  );

  const createMongoBackup = useCallback(
    async (withDownload: boolean) => {
      if (!adminToken) {
        showMessage(t('backup.signInConfig'), 'error');
        return;
      }
      const dbName = mongoDbName.trim();
      if (!dbName) {
        showMessage(t('backup.enterDbName'), 'error');
        return;
      }
      setBusy('mongo-create');
      try {
        const res = await adminFetchJson<
          ApiEnvelope<{ backupFile: string; dbName: string; success: boolean }>
        >(`${backupBase}/mongo/create`, adminToken, {
          method: 'POST',
          body: JSON.stringify({ dbName }),
        });
        const backupFile = res.data?.backupFile ?? '';
        const fileName = basenameFromPath(backupFile);
        await loadMongoSection();
        await loadHistorySection();
        if (withDownload && fileName) {
          await downloadBackupBlob(
            `${backupBase}/mongo/download/${encodeURIComponent(fileName)}`,
            adminToken,
            fileName,
          );
          showMessage(t('backup.mongoDownloaded', { fileName }), 'success');
        } else if (fileName) {
          showMessage(t('backup.mongoCreated'), 'success');
        } else {
          showMessage(t('backup.mongoCreatedSkipDownload'), 'info');
        }
      } catch (e) {
        handleError(e);
      } finally {
        setBusy(null);
      }
    },
    [
      adminToken,
      backupBase,
      handleError,
      loadHistorySection,
      loadMongoSection,
      mongoDbName,
      showMessage,
      t,
    ],
  );

  const createImagesBackup = useCallback(
    async (withDownload: boolean) => {
      if (!adminToken) {
        showMessage(t('backup.signInConfig'), 'error');
        return;
      }
      setBusy('images-create');
      try {
        const res = await adminFetchJson<ApiEnvelope<{ path: string; size: number }>>(
          `${backupBase}/images/create`,
          adminToken,
          { method: 'POST', body: JSON.stringify({}) },
        );
        const fileName = basenameFromPath(res.data?.path ?? '');
        await loadImagesSection();
        await loadHistorySection();
        if (withDownload && fileName) {
          await downloadBackupBlob(
            `${backupBase}/images/download/${encodeURIComponent(fileName)}`,
            adminToken,
            fileName,
          );
          showMessage(t('backup.imagesDownloaded', { fileName }), 'success');
        } else if (fileName) {
          showMessage(t('backup.imagesCreated'), 'success');
        } else {
          showMessage(t('backup.imagesCreatedSkipDownload'), 'info');
        }
      } catch (e) {
        handleError(e);
      } finally {
        setBusy(null);
      }
    },
    [adminToken, backupBase, handleError, loadHistorySection, loadImagesSection, showMessage, t],
  );

  const runConfirmAction = useCallback(async () => {
    if (!confirm || !adminToken) return;
    const action = confirm;
    setConfirm(null);
    setBusy(action.kind);

    try {
      switch (action.kind) {
        case 'mongo-restore': {
          await adminFetchJson(`${backupBase}/mongo/restore`, adminToken, {
            method: 'POST',
            body: JSON.stringify({
              archivePath: `./src/backups/${action.fileName}`,
              dbName: action.dbName,
              gzip: true,
            }),
          });
          showMessage(t('backup.restoreStartedMongo'), 'success');
          break;
        }
        case 'images-restore': {
          await adminFetchJson(
            `${backupBase}/images/restore-from-file/${encodeURIComponent(action.fileName)}`,
            adminToken,
            { method: 'POST', body: JSON.stringify({}) },
          );
          showMessage(t('backup.imagesRestoreStarted'), 'success');
          break;
        }
        case 'mongo-delete': {
          await adminFetchJson(`${backupBase}/mongo/delete`, adminToken, {
            method: 'DELETE',
            body: JSON.stringify({ fileName: action.fileName }),
          });
          await loadMongoSection();
          break;
        }
        case 'images-delete': {
          await adminFetchJson(
            `${backupBase}/images/delete/${encodeURIComponent(action.fileName)}`,
            adminToken,
            { method: 'DELETE' },
          );
          await loadImagesSection();
          break;
        }
        case 'config-delete': {
          await adminFetchJson(
            `${backupBase}/config/delete/${encodeURIComponent(action.fileName)}`,
            adminToken,
            { method: 'DELETE' },
          );
          await loadConfigSection();
          break;
        }
        case 'cleanup': {
          await adminFetchJson(`${backupBase}/cleanup/trigger`, adminToken, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          showMessage(t('backup.cleanupTriggered'), 'success');
          await loadHistorySection();
          break;
        }
        case 'auto': {
          const res = await adminFetchJson<ApiEnvelope<unknown>>(`${backupBase}/auto/trigger`, adminToken, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          if (res.success === false) {
            showMessage(res.message ?? t('common.error'), 'error');
          } else {
            showMessage(t('backup.autoCompleted'), 'success');
          }
          await loadHistorySection();
          await loadMongoSection();
          await loadImagesSection();
          break;
        }
        case 'pull': {
          if (!bridge?.runLocalMongoImagesPull) {
            showMessage(t('backup.openFolderElectronOnly'), 'error');
            break;
          }
          setPulling(true);
          const result = await bridge.runLocalMongoImagesPull();
          setPulling(false);
          if (result.ok) {
            showMessage(t('backup.pullCompleted'), 'success');
            await loadLocalSection();
          } else {
            showMessage(result.error ?? t('backup.pullFailed'), 'error');
          }
          break;
        }
        case 'env-push': {
          const res = await adminFetchJson<
            ApiEnvelope<{ results?: Array<{ path: string }> }>
          >(`${backupBase}/config/env/push`, adminToken, {
            method: 'POST',
            body: JSON.stringify({ target: action.target, entries: action.entries }),
          });
          const paths =
            res.data?.results?.map((row) => row.path).join('; ') ?? action.target;
          showMessage(t('backup.envPushOk', { paths }), 'success');
          break;
        }
        default:
          break;
      }
    } catch (e) {
      if (action.kind === 'env-push') {
        handleError(e, t('backup.envPushFailed'));
      } else {
        handleError(e);
      }
    } finally {
      setBusy(null);
      setPulling(false);
    }
  }, [
    adminToken,
    backupBase,
    bridge,
    confirm,
    handleError,
    loadConfigSection,
    loadHistorySection,
    loadImagesSection,
    loadLocalSection,
    loadMongoSection,
    showMessage,
    t,
  ]);

  const confirmTitle = useMemo(() => {
    if (!confirm) return '';
    switch (confirm.kind) {
      case 'mongo-restore':
        return t('backup.confirmRestoreMongo', { fileName: confirm.fileName });
      case 'images-restore':
        return t('backup.confirmRestoreImages', { fileName: confirm.fileName });
      case 'mongo-delete':
      case 'images-delete':
      case 'config-delete':
        return t('backup.confirmDelete', { fileName: confirm.fileName });
      case 'cleanup':
        return t('backup.confirmCleanup');
      case 'auto':
        return t('backup.confirmAuto');
      case 'pull':
        return t('backup.confirmPull');
      case 'env-push':
        return t('backup.confirmEnvPush', {
          count: String(confirm.entries.length),
          target:
            confirm.target === 'both'
              ? t('backup.envPushBothTargets')
              : confirm.target === 'backend'
                ? t('backup.envPushTargetBackend')
                : t('backup.envPushTargetFrontend'),
        });
      default:
        return '';
    }
  }, [confirm, t]);

  const confirmButtonLabel = useMemo(() => {
    if (!confirm) return t('common.save');
    switch (confirm.kind) {
      case 'mongo-restore':
      case 'images-restore':
        return t('common.restore');
      case 'mongo-delete':
      case 'images-delete':
      case 'config-delete':
        return t('common.delete');
      case 'cleanup':
        return t('backup.runCleanup');
      case 'auto':
        return t('backup.triggerNow');
      case 'pull':
        return t('backup.pullNow');
      case 'env-push':
        return t('backup.envPushSubmit');
      default:
        return t('common.save');
    }
  }, [confirm, t]);

  const submitEnvPush = () => {
    const entries = envRows
      .map((row) => ({ key: row.key.trim(), value: row.value }))
      .filter((row) => row.key.length > 0);
    if (entries.length === 0) {
      showMessage(t('backup.envPushNeedKey'), 'error');
      return;
    }
    setConfirm({ kind: 'env-push', target: envPushTarget, entries });
  };

  const openLocalFolder = async () => {
    if (!bridge?.openLocalBackupsFolder) {
      showMessage(t('backup.openFolderElectronOnly'), 'error');
      return;
    }
    const result = await bridge.openLocalBackupsFolder();
    if (result.ok) {
      showMessage(t('backup.openedFolder', { path: result.path }), 'success');
    } else {
      showMessage(result.error ?? t('backup.couldNotOpenFolder'), 'error');
    }
  };

  const openDownloadsFolder = async () => {
    if (!bridge?.openDownloadsFolder) {
      showMessage(t('backup.openDownloadsElectronOnly'), 'error');
      return;
    }
    const result = await bridge.openDownloadsFolder();
    if (result.ok) {
      showMessage(t('backup.openedFolder', { path: result.path }), 'success');
    } else {
      showMessage(result.error ?? t('backup.couldNotOpenDownloads'), 'error');
    }
  };

  const extraPathLabel = (id: string): string => {
    const key = `backup.extraPath.${id}`;
    const label = t(key);
    return label === key ? id : label;
  };

  const isDisabled = !adminToken || busy !== null || pulling;

  return (
    <div className="space-y-6">
      {message ? (
        <MessageBanner
          type={message.type}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Btn disabled={busy === 'refresh'} onClick={() => void refreshAll()}>
          {t('backup.refreshAll')}
        </Btn>
        {!adminToken ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">{t('backup.signInConfig')}</p>
        ) : null}
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('backup.destinationTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">{t('backup.destinationHint')}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="backup-destination"
              checked={destination === 'saveServer'}
              onChange={() => setDestination('saveServer')}
            />
            {t('backup.saveServer')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="backup-destination"
              checked={destination === 'saveServerAndLocal'}
              onChange={() => setDestination('saveServerAndLocal')}
            />
            {t('backup.saveServerAndLocal')}
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('backup.localDailyTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">{t('backup.localDailyHint')}</p>
        <p className="mt-3 text-sm">
          <span className="font-medium">{t('backup.folder')}: </span>
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-900">
            {localBackupsPath ?? localBackups?.dir ?? t('backup.notLoaded')}
          </code>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="secondary" disabled={!bridge} onClick={() => void loadLocalSection()}>
            {t('backup.refreshLocalList')}
          </Btn>
          <Btn variant="secondary" disabled={!bridge} onClick={() => void openLocalFolder()}>
            {t('backup.openLocalFolder')}
          </Btn>
          <Btn
            variant="warning"
            disabled={!bridge || pulling}
            onClick={() => setConfirm({ kind: 'pull' })}
          >
            {pulling ? t('backup.pulling') : t('backup.pullNow')}
          </Btn>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <h3 className="font-medium text-text-primary dark:text-gray-100">{t('backup.mongoGz')}</h3>
            {localBackups?.mongo?.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {localBackups.mongo.map((row) => (
                  <li key={row.fileName} className="font-mono text-xs">
                    {row.fileName}{' '}
                    <span className="text-text-muted">
                      ({row.sizeMB} MB · {row.createdAt})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">{t('backup.noMongoLocal')}</p>
            )}
          </section>
          <section>
            <h3 className="font-medium text-text-primary dark:text-gray-100">{t('backup.imagesZip')}</h3>
            {localBackups?.images?.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {localBackups.images.map((row) => (
                  <li key={row.fileName} className="font-mono text-xs">
                    {row.fileName}{' '}
                    <span className="text-text-muted">
                      ({row.sizeMB} MB · {row.createdAt})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">{t('backup.noImagesLocal')}</p>
            )}
          </section>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('backup.nginxEnvTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">{t('backup.nginxEnvHint')}</p>
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <p className="font-medium">{t('backup.migrateTitle')}</p>
          <p className="mt-1">{t('backup.migrateHint')}</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5">
            <li>{t('backup.migrateStep1')}</li>
            <li>{t('backup.migrateStep2')}</li>
            <li>{t('backup.migrateStep3')}</li>
          </ol>
        </div>

        <div className="mt-4 space-y-4">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              {t('backup.apiReadFrom')}
            </h3>
            {!adminToken ? (
              <p className="mt-2 text-sm">{t('backup.signInForPaths')}</p>
            ) : configLocations ? (
              <dl className="mt-2 space-y-2 text-sm">
                <div>
                  <dt className="font-medium">{t('backup.nginxSite')}</dt>
                  <dd className="font-mono text-xs">{configLocations.nginxPath}</dd>
                  <dd>
                    <PathStatus
                      ok={configLocations.nginxExists && configLocations.nginxIsFile}
                      label={
                        configLocations.nginxExists && configLocations.nginxIsFile
                          ? t('backup.readable')
                          : t('backup.missing')
                      }
                    />
                    {configLocations.nginxExists && !configLocations.nginxIsFile ? (
                      <p className="mt-1 text-amber-600 dark:text-amber-400">{t('backup.nginxPathWarn')}</p>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">{t('backup.backendEnv')}</dt>
                  <dd className="font-mono text-xs">{configLocations.backendEnvPath}</dd>
                  <dd>
                    <PathStatus
                      ok={configLocations.backendEnvExists}
                      label={
                        configLocations.backendEnvExists ? t('backup.readable') : t('backup.missing')
                      }
                    />
                    {!configLocations.backendEnvExplicit ? (
                      <p className="mt-1 text-text-muted">{t('backup.backendEnvWarn')}</p>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">{t('backup.frontendEnv')}</dt>
                  <dd className="font-mono text-xs">{configLocations.frontendEnvPath ?? '—'}</dd>
                  <dd>
                    <PathStatus
                      ok={configLocations.frontendEnvExists}
                      label={
                        configLocations.frontendEnvExists ? t('backup.readable') : t('backup.missing')
                      }
                    />
                    {configLocations.frontendEnvConfigured && !configLocations.frontendEnvExists ? (
                      <p className="mt-1 text-amber-600 dark:text-amber-400">{t('backup.frontendEnvNotFound')}</p>
                    ) : null}
                    {!configLocations.frontendEnvConfigured ? (
                      <p className="mt-1 text-text-muted">{t('backup.frontendEnvBothPaths')}</p>
                    ) : null}
                  </dd>
                </div>
                {configLocations.frontendEnvProductionPath ? (
                  <div>
                    <dt className="font-medium">{t('backup.frontendEnvProduction')}</dt>
                    <dd className="font-mono text-xs">{configLocations.frontendEnvProductionPath}</dd>
                    <dd>
                      <PathStatus
                        ok={configLocations.frontendEnvProductionExists}
                        label={
                          configLocations.frontendEnvProductionExists
                            ? t('backup.readable')
                            : t('backup.missing')
                        }
                      />
                    </dd>
                  </div>
                ) : null}
                {configLocations.extraPaths && configLocations.extraPaths.length > 0 ? (
                  <div>
                    <dt className="font-medium">{t('backup.linuxMigratePaths')}</dt>
                    <dd className="mt-2 space-y-2">
                      {configLocations.extraPaths.map((row) => (
                        <div key={row.id}>
                          <p className="text-sm">{extraPathLabel(row.id)}</p>
                          <p className="font-mono text-xs">{row.path}</p>
                          <PathStatus
                            ok={row.exists && row.readable}
                            label={
                              row.exists && row.readable
                                ? t('backup.readable')
                                : row.exists
                                  ? t('backup.notReadable')
                                  : t('backup.missing')
                            }
                          />
                        </div>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-text-muted">{t('backup.pathsNotLoaded')}</p>
            )}
          </section>

          {configLocations ? (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {t('backup.apiZipTo')}
              </h3>
              <p className="mt-1 font-mono text-xs">{configLocations.backupDir}</p>
              <p className="mt-2 text-sm text-text-muted">{t('backup.zipArchiveHint')}</p>
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              {t('backup.thisComputer')}
            </h3>
            <p className="mt-1 font-mono text-xs">{downloadsPath ?? t('backup.notLoaded')}</p>
            <p className="mt-2 text-sm text-text-muted">
              {bridge ? t('backup.downloadsElectronHint') : t('backup.downloadsBrowserHint')}
            </p>
            <Btn variant="secondary" className="mt-3" onClick={() => void openDownloadsFolder()}>
              {t('backup.openDownloads')}
            </Btn>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Btn disabled={isDisabled} onClick={() => void createConfigBackup('migrate', shouldDownload)}>
            {shouldDownload ? t('backup.backupMigrateDownload') : t('backup.backupMigrate')}
          </Btn>
          <Btn disabled={isDisabled} onClick={() => void createConfigBackup('nginx', shouldDownload)}>
            {shouldDownload ? t('backup.backupNginxDownload') : t('backup.backupNginx')}
          </Btn>
          <Btn disabled={isDisabled} onClick={() => void createConfigBackup('env', shouldDownload)}>
            {shouldDownload ? t('backup.backupEnvDownload') : t('backup.backupEnv')}
          </Btn>
          <Btn disabled={isDisabled} onClick={() => void createConfigBackup('both', shouldDownload)}>
            {shouldDownload ? t('backup.backupBothDownload') : t('backup.backupBoth')}
          </Btn>
          <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadConfigSection()}>
            {t('backup.reloadList')}
          </Btn>
        </div>

        <h3 className="mt-6 font-medium text-text-primary dark:text-gray-100">{t('backup.recentZips')}</h3>
        {configZips.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">{t('backup.noneLoaded')}</p>
        ) : (
          <TableShell className="mt-3" minWidth={640}>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className={tableHeadClass}>File</th>
                <th className={tableHeadClass}>Size</th>
                <th className={tableHeadClass}>Created</th>
                <th className={tableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {configZips.map((row) => (
                <tr key={row.fileName} className="border-b border-gray-100 dark:border-gray-700">
                  <td className={`${tableCellClass} font-mono text-xs`}>{row.fileName}</td>
                  <td className={tableCellClass}>{row.sizeMB} MB</td>
                  <td className={tableCellClass}>{row.createdAt}</td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-2">
                      <Btn
                        variant="secondary"
                        disabled={isDisabled}
                        onClick={() => void downloadExisting('config', row.fileName)}
                      >
                        {t('backup.downloadAgain')}
                      </Btn>
                      <Btn
                        variant="danger"
                        disabled={isDisabled}
                        onClick={() => setConfirm({ kind: 'config-delete', fileName: row.fileName })}
                      >
                        {t('common.delete')}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">{t('backup.mongoTitle')}</h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">{t('backup.databasesOnServer')}</p>
        {mongoDatabases.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">{t('backup.noDbNames')}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {mongoDatabases.map((name) => (
              <Btn
                key={name}
                variant={mongoDbName === name ? 'primary' : 'secondary'}
                title={t('backup.useAsDbTitle')}
                onClick={() => setMongoDbName(name)}
              >
                {name}
              </Btn>
            ))}
          </div>
        )}

        <Field label={t('backup.databaseName')} className="mt-4 max-w-sm">
          <Input
            value={mongoDbName}
            placeholder={t('backup.dbNamePlaceholder')}
            disabled={isDisabled}
            onChange={(e) => setMongoDbName(e.target.value)}
          />
        </Field>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn disabled={isDisabled} onClick={() => void createMongoBackup(shouldDownload)}>
            {shouldDownload ? t('backup.createAndDownload') : t('backup.createBackup')}
          </Btn>
          <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadMongoSection()}>
            {t('backup.loadMongoList')}
          </Btn>
        </div>

        {mongoBackups.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">{t('backup.noMongoBackups')}</p>
        ) : (
          <TableShell className="mt-4" minWidth={720}>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className={tableHeadClass}>File</th>
                <th className={tableHeadClass}>DB</th>
                <th className={tableHeadClass}>Size</th>
                <th className={tableHeadClass}>Created</th>
                <th className={tableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mongoBackups.map((row) => (
                <tr key={row.fileName} className="border-b border-gray-100 dark:border-gray-700">
                  <td className={`${tableCellClass} font-mono text-xs`}>{row.fileName}</td>
                  <td className={tableCellClass}>{row.dbName ?? '—'}</td>
                  <td className={tableCellClass}>{row.sizeMB} MB</td>
                  <td className={tableCellClass}>{row.createdAt}</td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-2">
                      <Btn
                        variant="secondary"
                        disabled={isDisabled}
                        onClick={() => void downloadExisting('mongo', row.fileName)}
                      >
                        {t('backup.downloadAgain')}
                      </Btn>
                      <Btn
                        variant="warning"
                        disabled={isDisabled}
                        onClick={() =>
                          setConfirm({
                            kind: 'mongo-restore',
                            fileName: row.fileName,
                            dbName:
                              row.dbName && row.dbName !== '—'
                                ? row.dbName
                                : mongoDbName.trim() || row.fileName.split('-')[0] || '',
                          })
                        }
                      >
                        {t('common.restore')}
                      </Btn>
                      <Btn
                        variant="danger"
                        disabled={isDisabled}
                        onClick={() => setConfirm({ kind: 'mongo-delete', fileName: row.fileName })}
                      >
                        {t('common.delete')}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">{t('backup.imagesTitle')}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn disabled={isDisabled} onClick={() => void createImagesBackup(shouldDownload)}>
            {shouldDownload ? t('backup.createZipDownload') : t('backup.createZip')}
          </Btn>
          <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadImagesSection()}>
            {t('backup.loadImagesList')}
          </Btn>
        </div>

        {imagesBackups.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">{t('backup.noImageBackups')}</p>
        ) : (
          <TableShell className="mt-4" minWidth={640}>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className={tableHeadClass}>File</th>
                <th className={tableHeadClass}>Size</th>
                <th className={tableHeadClass}>Created</th>
                <th className={tableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {imagesBackups.map((row) => (
                <tr key={row.fileName} className="border-b border-gray-100 dark:border-gray-700">
                  <td className={`${tableCellClass} font-mono text-xs`}>{row.fileName}</td>
                  <td className={tableCellClass}>{row.sizeMB} MB</td>
                  <td className={tableCellClass}>{row.createdAt}</td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-2">
                      <Btn
                        variant="secondary"
                        disabled={isDisabled}
                        onClick={() => void downloadExisting('images', row.fileName)}
                      >
                        {t('backup.downloadAgain')}
                      </Btn>
                      <Btn
                        variant="warning"
                        disabled={isDisabled}
                        onClick={() => setConfirm({ kind: 'images-restore', fileName: row.fileName })}
                      >
                        {t('common.restore')}
                      </Btn>
                      <Btn
                        variant="danger"
                        disabled={isDisabled}
                        onClick={() => setConfirm({ kind: 'images-delete', fileName: row.fileName })}
                      >
                        {t('common.delete')}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">{t('backup.historyTitle')}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadHistorySection()}>
            {t('backup.reloadAll')}
          </Btn>
          <Btn variant="warning" disabled={isDisabled} onClick={() => setConfirm({ kind: 'cleanup' })}>
            {t('backup.runCleanup')}
          </Btn>
          <Btn variant="info" disabled={isDisabled} onClick={() => setConfirm({ kind: 'auto' })}>
            {t('backup.triggerNow')}
          </Btn>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <section>
            <h3 className="font-medium">{t('backup.cleanupTitle')}</h3>
            {cleanupStats ? (
              <ul className="mt-2 space-y-1 text-sm">
                <li>Total files: {cleanupStats.totalFiles}</li>
                <li>Old files: {cleanupStats.oldFiles}</li>
                <li>Total size: {cleanupStats.totalSize}</li>
                <li>Old size: {cleanupStats.oldFilesSize}</li>
                <li>{cleanupStats.nextCleanup}</li>
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">{t('backup.notLoaded')}</p>
            )}
          </section>
          <section>
            <h3 className="font-medium">{t('backup.autoTitle')}</h3>
            {autoStats ? (
              <ul className="mt-2 space-y-1 text-sm">
                <li>Enabled: {autoStats.enabled ? 'yes' : 'no'}</li>
                <li>{autoStats.schedule}</li>
                <li>Next: {autoStats.nextBackup}</li>
                <li>DB: {autoStats.databaseName}</li>
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">{t('backup.notLoaded')}</p>
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{t('backup.mongoHistory')}</h3>
              <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadHistorySection()}>
                {t('backup.reload')}
              </Btn>
            </div>
            {historyMongo.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">{t('backup.noMongoHistory')}</p>
            ) : (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                {historyMongo.join('\n')}
              </pre>
            )}
          </section>
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{t('backup.imagesHistory')}</h3>
              <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadHistorySection()}>
                {t('backup.reload')}
              </Btn>
            </div>
            {historyImages.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">{t('backup.noImagesHistory')}</p>
            ) : (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                {historyImages.join('\n')}
              </pre>
            )}
          </section>
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{t('backup.historyTitle')}</h3>
              <Btn variant="secondary" disabled={!adminToken} onClick={() => void loadHistorySection()}>
                {t('backup.reload')}
              </Btn>
            </div>
            {historyAll.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">{t('backup.noHistory')}</p>
            ) : (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                {historyAll.join('\n')}
              </pre>
            )}
          </section>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">{t('backup.envPushTitle')}</h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">{t('backup.envPushHint')}</p>

        <Field label={t('backup.envPushTargetLabel')} className="mt-4 max-w-sm">
          <Select
            value={envPushTarget}
            disabled={isDisabled}
            onChange={(e) => setEnvPushTarget(e.target.value as EnvPushTarget)}
          >
            <option value="backend">{t('backup.envPushTargetBackend')}</option>
            <option value="frontend">{t('backup.envPushTargetFrontend')}</option>
            <option value="both">{t('backup.envPushTargetBoth')}</option>
          </Select>
        </Field>

        <div className="mt-4 space-y-3">
          {envRows.map((row, index) => (
            <div key={row.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Field label={index === 0 ? t('backup.envPushKey') : ''}>
                <Input
                  value={row.key}
                  disabled={isDisabled}
                  placeholder="GOOGLE_CLIENT_ID"
                  onChange={(e) =>
                    setEnvRows((prev) =>
                      prev.map((item) => (item.id === row.id ? { ...item, key: e.target.value } : item)),
                    )
                  }
                />
              </Field>
              <Field label={index === 0 ? t('backup.envPushValue') : ''}>
                <Input
                  value={row.value}
                  disabled={isDisabled}
                  placeholder={t('backup.envPushValuePlaceholder')}
                  onChange={(e) =>
                    setEnvRows((prev) =>
                      prev.map((item) => (item.id === row.id ? { ...item, value: e.target.value } : item)),
                    )
                  }
                />
              </Field>
              <div className={index === 0 ? 'pt-6' : ''}>
                <Btn
                  variant="secondary"
                  disabled={envRows.length <= 1 || isDisabled}
                  onClick={() => setEnvRows((prev) => prev.filter((item) => item.id !== row.id))}
                >
                  {t('backup.envPushRemoveRow')}
                </Btn>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            variant="secondary"
            disabled={isDisabled}
            onClick={() => setEnvRows((prev) => [...prev, { id: nextRowId(), key: '', value: '' }])}
          >
            {t('backup.envPushAddRow')}
          </Btn>
          <Btn disabled={isDisabled} onClick={submitEnvPush}>
            {t('backup.envPushSubmit')}
          </Btn>
        </div>
      </Card>

      <RestoreBackupPanel onMessage={showMessage} />

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirmTitle.split('\n')[0] ?? t('common.error')}
      >
        {confirmTitle.includes('\n') ? (
          <p className="whitespace-pre-wrap text-sm text-text-secondary dark:text-gray-300">
            {confirmTitle.slice(confirmTitle.indexOf('\n') + 1).trim()}
          </p>
        ) : null}
        <div className={`flex justify-end gap-2 ${confirmTitle.includes('\n') ? 'mt-6' : 'mt-2'}`}>
          <Btn variant="secondary" onClick={() => setConfirm(null)}>
            {t('common.cancel')}
          </Btn>
          <Btn variant="danger" disabled={busy !== null || pulling} onClick={() => void runConfirmAction()}>
            {confirmButtonLabel}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
