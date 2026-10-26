import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { Btn, Card, Field, MessageBanner, Select } from '@/components/ui';
import { DesktopUpdatesPanel } from '@/app/logs/DesktopUpdatesPanel';

type ByteInfo = { bytes: number; mb: number; gb: number; label: string };

type ServerStatus = {
  hostname: string;
  platform: string;
  nodeVersion: string;
  timestamp: string;
  uptimeSeconds: number;
  processUptimeSeconds: number;
  loadAverage: number[];
  memory: {
    total: ByteInfo;
    used: ByteInfo;
    free: ByteInfo;
    usedPercent: number;
  };
  services: {
    backend: { unit: string; active: string; error?: string };
    frontend: { unit: string; active: string; error?: string };
  };
  restartAllowed: boolean;
  deployAllowed: boolean;
  deployDir: string;
  frontendDeployDir: string;
  frontendWebRoot: string;
  nginxSitePath: string;
};

type ApiEnvelope<T> = { success: boolean; message: string; data: T };

type DeployLogListItem = {
  name: string;
  kind: 'backend' | 'frontend';
  deployDir: string;
  sizeBytes: number;
  updatedAt: string;
  finished: boolean;
};

type DeployLogContent = {
  name: string;
  content: string;
  truncated: boolean;
  finished: boolean;
  sizeBytes: number;
  updatedAt: string;
};

type DeployStartDto = {
  kind: 'backend' | 'frontend';
  deployDir: string;
  logFile: string;
  logName: string;
  steps: string[];
  pid?: number;
  webRoot?: string;
};

type ServerEnvFile = {
  fileKey: string;
  path: string;
  exists: boolean;
  content: string;
  sizeBytes: number;
  updatedAt: string | null;
};

type DeployLogFilter = 'all' | 'backend' | 'frontend';

type EnvFileKey = 'backend' | 'frontend' | 'frontend-production';

type Banner = { type: 'success' | 'error' | 'info'; text: string };

const DEPLOY_LOG_POLL_MS = 2500;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

function memLabel(info: ByteInfo | undefined): string {
  if (!info) return '—';
  return info.label || formatBytes(info.bytes);
}

function detectNpmError(content: string): boolean {
  return /npm ERR!|npm error code|npm error/i.test(content);
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-sm text-text-primary dark:text-gray-100">{value}</dd>
    </div>
  );
}

export function ServerControlPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const serverBase = `${logsApiBase}/server`;

  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [actionBusy, setActionBusy] = useState(false);
  const [clearDistBackend, setClearDistBackend] = useState(true);
  const [clearDistFrontend, setClearDistFrontend] = useState(true);

  const [deployLogFilter, setDeployLogFilter] = useState<DeployLogFilter>('all');
  const [deployLogs, setDeployLogs] = useState<DeployLogListItem[]>([]);
  const [deployLogsLoading, setDeployLogsLoading] = useState(false);
  const [selectedLogName, setSelectedLogName] = useState('');
  const [deployLogContent, setDeployLogContent] = useState<DeployLogContent | null>(null);
  const [deployLogError, setDeployLogError] = useState<string | null>(null);

  const [envFiles, setEnvFiles] = useState<Partial<Record<EnvFileKey, ServerEnvFile>>>({});
  const [envLoadingKey, setEnvLoadingKey] = useState<EnvFileKey | null>(null);
  const [expandedEnvKey, setExpandedEnvKey] = useState<EnvFileKey | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedLog = useMemo(
    () => deployLogs.find((l) => l.name === selectedLogName) ?? null,
    [deployLogs, selectedLogName],
  );

  const logRunning = deployLogContent != null && !deployLogContent.finished;

  const clearDistBackendPath = status ? `${status.deployDir}/dist` : 'dist';
  const clearDistFrontendPaths = status
    ? [ `${status.frontendDeployDir}/dist`, status.frontendWebRoot ].filter(Boolean).join(', ')
    : 'dist';

  const loadStatus = useCallback(async () => {
    if (!adminToken) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await adminFetchJson<ApiEnvelope<ServerStatus>>(
        `${serverBase}/status`,
        adminToken,
      );
      setStatus(res.data);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setStatusError(e instanceof Error ? e.message : t('serverControl.loadFailed'));
    } finally {
      setStatusLoading(false);
    }
  }, [adminToken, serverBase, t]);

  const loadDeployLogs = useCallback(async () => {
    if (!adminToken) return;
    setDeployLogsLoading(true);
    try {
      const kindParam =
        deployLogFilter === 'all' ? '' : `kind=${encodeURIComponent(deployLogFilter)}&`;
      const res = await adminFetchJson<ApiEnvelope<{ logs: DeployLogListItem[] }>>(
        `${serverBase}/deploy/logs?${kindParam}limit=40`,
        adminToken,
      );
      const logs = res.data?.logs ?? [];
      setDeployLogs(logs);
      if (selectedLogName && !logs.some((l) => l.name === selectedLogName)) {
        setSelectedLogName('');
        setDeployLogContent(null);
      }
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setDeployLogError(e instanceof Error ? e.message : t('serverControl.deployLogLoadFailed'));
    } finally {
      setDeployLogsLoading(false);
    }
  }, [adminToken, deployLogFilter, selectedLogName, serverBase, t]);

  const loadDeployLogContent = useCallback(
    async (logName: string, silent = false) => {
      if (!adminToken || !logName) return;
      if (!silent) setDeployLogError(null);
      try {
        const res = await adminFetchJson<ApiEnvelope<DeployLogContent>>(
          `${serverBase}/deploy/logs/${encodeURIComponent(logName)}`,
          adminToken,
        );
        setDeployLogContent(res.data);
        setDeployLogs((prev) =>
          prev.map((item) =>
            item.name === logName ? { ...item, finished: res.data.finished } : item,
          ),
        );
      } catch (e) {
        if (isAdminSessionExpiredError(e)) return;
        setDeployLogError(
          e instanceof Error ? e.message : t('serverControl.deployLogLoadFailed'),
        );
      }
    },
    [adminToken, serverBase, t],
  );

  const loadEnvFile = useCallback(
    async (fileKey: EnvFileKey) => {
      if (!adminToken) return;
      setEnvLoadingKey(fileKey);
      try {
        const res = await adminFetchJson<ApiEnvelope<ServerEnvFile>>(
          `${logsApiBase}/backup/server/env/${encodeURIComponent(fileKey)}`,
          adminToken,
        );
        setEnvFiles((prev) => ({ ...prev, [fileKey]: res.data }));
        setExpandedEnvKey(fileKey);
      } catch (e) {
        if (isAdminSessionExpiredError(e)) return;
        setBanner({
          type: 'error',
          text: e instanceof Error ? e.message : t('serverControl.envFileLoadFailed'),
        });
      } finally {
        setEnvLoadingKey(null);
      }
    },
    [adminToken, logsApiBase, t],
  );

  useEffect(() => {
    if (!adminToken) {
      setStatus(null);
      setDeployLogs([]);
      setDeployLogContent(null);
      return;
    }
    void loadStatus();
    void loadDeployLogs();
  }, [adminToken, deployLogFilter, loadStatus, loadDeployLogs]);

  useEffect(() => {
    if (!adminToken || !selectedLogName) {
      setDeployLogContent(null);
      return;
    }
    void loadDeployLogContent(selectedLogName);
  }, [adminToken, selectedLogName, loadDeployLogContent]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!adminToken || !selectedLogName || !logRunning) return;

    pollRef.current = setInterval(() => {
      void loadDeployLogContent(selectedLogName, true);
      void loadDeployLogs();
    }, DEPLOY_LOG_POLL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [adminToken, selectedLogName, logRunning, loadDeployLogContent, loadDeployLogs]);

  const runRestart = async (kind: 'backend' | 'frontend') => {
    if (!adminToken || actionBusy) return;
    const confirmText =
      kind === 'backend'
        ? t('serverControl.confirmRestartBackend')
        : t('serverControl.confirmRestartFrontend');
    if (!window.confirm(confirmText)) return;

    setActionBusy(true);
    setBanner(null);
    try {
      const res = await adminFetchJson<ApiEnvelope<unknown>>(
        `${serverBase}/restart/${kind}`,
        adminToken,
        { method: 'POST', body: '{}' },
      );
      setBanner({ type: 'success', text: res.message || t('serverControl.restartOk') });
      void loadStatus();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setBanner({
        type: 'error',
        text: e instanceof Error ? e.message : t('serverControl.restartFailed'),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const runDeploy = async (kind: 'backend' | 'frontend') => {
    if (!adminToken || actionBusy || !status) return;
    const clearDist = kind === 'backend' ? clearDistBackend : clearDistFrontend;
    const clearDistNote = clearDist ? t('serverControl.deployClearDistYes') : '';
    const confirmText =
      kind === 'backend'
        ? t('serverControl.confirmDeployBackend', {
            dir: status.deployDir,
            clearDist: clearDistNote,
          })
        : t('serverControl.confirmDeployFrontend', {
            dir: status.frontendDeployDir,
            clearDist: clearDistNote,
            webRoot: status.frontendWebRoot,
          });
    if (!window.confirm(confirmText)) return;

    setActionBusy(true);
    setBanner(null);
    try {
      const res = await adminFetchJson<ApiEnvelope<DeployStartDto>>(
        `${serverBase}/deploy/${kind}`,
        adminToken,
        {
          method: 'POST',
          body: JSON.stringify({ clearDist }),
        },
      );
      setBanner({
        type: 'success',
        text:
          kind === 'backend'
            ? t('serverControl.deployStarted')
            : t('serverControl.deployFrontendStarted'),
      });
      if (res.data?.logName) {
        setSelectedLogName(res.data.logName);
        setDeployLogFilter(kind);
      }
      void loadDeployLogs();
      if (res.data?.logName) {
        void loadDeployLogContent(res.data.logName);
      }
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setBanner({
        type: 'error',
        text: e instanceof Error ? e.message : t('serverControl.deployFailed'),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const runNpmInstall = async (kind: 'backend' | 'frontend') => {
    if (!adminToken || actionBusy || !status) return;
    const dir = kind === 'backend' ? status.deployDir : status.frontendDeployDir;
    if (
      !window.confirm(
        t('serverControl.confirmDeployNpmInstall', {
          kind,
          dir,
        }),
      )
    ) {
      return;
    }

    setActionBusy(true);
    setBanner(null);
    try {
      const res = await adminFetchJson<ApiEnvelope<DeployStartDto>>(
        `${serverBase}/deploy/npm-install/${kind}`,
        adminToken,
        { method: 'POST', body: '{}' },
      );
      setBanner({ type: 'success', text: t('serverControl.deployNpmInstallStarted') });
      if (res.data?.logName) {
        setSelectedLogName(res.data.logName);
        setDeployLogFilter(kind);
      }
      void loadDeployLogs();
      if (res.data?.logName) {
        void loadDeployLogContent(res.data.logName);
      }
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setBanner({
        type: 'error',
        text: e instanceof Error ? e.message : t('serverControl.deployNpmInstallFailed'),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const envButtonLabel = (fileKey: EnvFileKey) => {
    if (fileKey === 'backend') return t('serverControl.viewBackendEnv');
    if (fileKey === 'frontend') return t('serverControl.viewFrontendEnv');
    return t('serverControl.viewFrontendEnvProduction');
  };

  const renderEnvSection = (fileKey: EnvFileKey) => {
    const data = envFiles[fileKey];
    const expanded = expandedEnvKey === fileKey;
    return (
      <div key={fileKey} className="space-y-2">
        <Btn
          variant="secondary"
          disabled={!adminToken || envLoadingKey === fileKey}
          onClick={() => void loadEnvFile(fileKey)}
        >
          {envLoadingKey === fileKey ? '…' : envButtonLabel(fileKey)}
        </Btn>
        {expanded && data ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
            <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              {t('serverControl.envFilesSecretsWarn')}
            </p>
            <p className="mb-2 break-all text-xs text-text-muted">
              <span className="font-medium">{t('serverControl.envFileShow')}:</span> {data.path}
              {!data.exists ? ` (${t('serverControl.envFileMissing')})` : null}
            </p>
            {!data.exists ? (
              <p className="text-sm text-text-secondary">{t('serverControl.envFileNotOnServer')}</p>
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-900 p-3 font-mono text-xs text-gray-100">
                {data.content.trim() ? data.content : t('serverControl.envFileEmpty')}
              </pre>
            )}
            <Btn
              variant="secondary"
              className="mt-2"
              onClick={() => setExpandedEnvKey(null)}
            >
              {t('common.dismiss')}
            </Btn>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {banner ? (
        <MessageBanner
          type={banner.type}
          text={banner.text}
          onDismiss={() => setBanner(null)}
        />
      ) : null}

      {!adminToken ? (
        <Card>
          <p className="text-sm text-text-secondary">{t('serverControl.signIn')}</p>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
              {t('serverControl.statusTitle')}
            </h2>
          </div>
          <Btn
            variant="info"
            disabled={!adminToken || statusLoading}
            onClick={() => void loadStatus()}
          >
            {t('serverControl.refresh')}
          </Btn>
        </div>

        {statusError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{statusError}</p>
        ) : null}

        {!status && !statusLoading && !statusError ? (
          <p className="text-sm text-text-muted">{t('serverControl.noData')}</p>
        ) : null}

        {statusLoading && !status ? (
          <p className="text-sm text-text-muted">…</p>
        ) : null}

        {status ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatusRow label={t('serverControl.hostname')} value={status.hostname} />
            <StatusRow
              label={t('serverControl.ramUsed')}
              value={`${memLabel(status.memory.used)} (${status.memory.usedPercent}%)`}
            />
            <StatusRow label={t('serverControl.ramFree')} value={memLabel(status.memory.free)} />
            <StatusRow
              label={t('serverControl.systemUptime')}
              value={formatDuration(status.uptimeSeconds)}
            />
            <StatusRow
              label={t('serverControl.apiUptime')}
              value={formatDuration(status.processUptimeSeconds)}
            />
            <StatusRow label={t('serverControl.platform')} value={status.platform} />
            <StatusRow label={t('serverControl.nodeVersion')} value={status.nodeVersion} />
            <StatusRow
              label={t('serverControl.loadAvg')}
              value={status.loadAverage.map((n) => n.toFixed(2)).join(', ')}
            />
            <StatusRow
              label={t('serverControl.lastUpdated')}
              value={new Date(status.timestamp).toLocaleString()}
            />
          </dl>
        ) : null}

        {status ? (
          <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-600">
            <h3 className="mb-3 text-base font-semibold text-text-primary dark:text-gray-100">
              {t('serverControl.servicesTitle')}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                <p className="text-xs font-medium uppercase text-text-muted">
                  {t('serverControl.backendService')}
                </p>
                <p className="mt-1 text-sm">
                  {status.services.backend.unit}:{' '}
                  <span className="font-medium">{status.services.backend.active}</span>
                </p>
                {status.services.backend.error ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {status.services.backend.error}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                <p className="text-xs font-medium uppercase text-text-muted">
                  {t('serverControl.frontendService')}
                </p>
                <p className="mt-1 text-sm">
                  {status.services.frontend.unit}:{' '}
                  <span className="font-medium">{status.services.frontend.active}</span>
                </p>
                {status.services.frontend.error ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {status.services.frontend.error}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('serverControl.actionsTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
          {t('serverControl.actionsHint')}
        </p>
        {!status?.restartAllowed ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t('serverControl.restartDisabled')}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            variant="warning"
            disabled={!adminToken || !status?.restartAllowed || actionBusy}
            onClick={() => void runRestart('backend')}
          >
            {t('serverControl.restartBackend')}
          </Btn>
          <Btn
            variant="warning"
            disabled={!adminToken || !status?.restartAllowed || actionBusy}
            onClick={() => void runRestart('frontend')}
          >
            {t('serverControl.restartFrontend')}
          </Btn>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('serverControl.deployBackendTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
          {t('serverControl.deployBackendHint')}
        </p>
        {status ? (
          <p className="mt-2 text-xs text-text-muted">
            {t('serverControl.deployBackendLogPath', { dir: status.deployDir })}
          </p>
        ) : null}
        {!status?.deployAllowed ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t('serverControl.deployDisabled')}
          </p>
        ) : null}
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={clearDistBackend}
            onChange={(e) => setClearDistBackend(e.target.checked)}
            disabled={!adminToken || !status?.deployAllowed || actionBusy}
          />
          <span>
            {t('serverControl.deployClearDist', { path: clearDistBackendPath })}
          </span>
        </label>
        <div className="mt-4">
          <Btn
            variant="success"
            disabled={!adminToken || !status?.deployAllowed || actionBusy}
            onClick={() => void runDeploy('backend')}
          >
            {t('serverControl.deployBackend')}
          </Btn>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('serverControl.deployFrontendTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
          {t('serverControl.deployFrontendHint')}
        </p>
        {status ? (
          <>
            <p className="mt-2 text-xs text-text-muted">
              {t('serverControl.deployFrontendLogPath', { dir: status.frontendDeployDir })}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {t('serverControl.nginxSite')}: {status.nginxSitePath}
            </p>
          </>
        ) : null}
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={clearDistFrontend}
            onChange={(e) => setClearDistFrontend(e.target.checked)}
            disabled={!adminToken || !status?.deployAllowed || actionBusy}
          />
          <span>
            {t('serverControl.deployClearDist', { path: clearDistFrontendPaths })}
          </span>
        </label>
        <div className="mt-4">
          <Btn
            variant="success"
            disabled={!adminToken || !status?.deployAllowed || actionBusy}
            onClick={() => void runDeploy('frontend')}
          >
            {t('serverControl.deployFrontend')}
          </Btn>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('serverControl.deployNpmInstall')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
          {t('serverControl.npmInstallHint')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            variant="info"
            disabled={!adminToken || !status?.deployAllowed || actionBusy}
            onClick={() => void runNpmInstall('backend')}
          >
            {t('serverControl.npmInstallBackend')}
          </Btn>
          <Btn
            variant="info"
            disabled={!adminToken || !status?.deployAllowed || actionBusy}
            onClick={() => void runNpmInstall('frontend')}
          >
            {t('serverControl.npmInstallFrontend')}
          </Btn>
        </div>
      </Card>

      <DesktopUpdatesPanel />

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
              {t('serverControl.deployLogTitle')}
            </h2>
            <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
              {t('serverControl.deployLogHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn
              variant="secondary"
              disabled={!adminToken || deployLogsLoading}
              onClick={() => void loadDeployLogs()}
            >
              {t('serverControl.deployLogReloadList')}
            </Btn>
            <Btn
              variant="info"
              disabled={!adminToken || !selectedLogName}
              onClick={() => void loadDeployLogContent(selectedLogName)}
            >
              {t('serverControl.deployLogRefresh')}
            </Btn>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem]">
            <Select
              value={deployLogFilter}
              onChange={(e) => setDeployLogFilter(e.target.value as DeployLogFilter)}
              disabled={!adminToken}
              aria-label={t('serverControl.deployLogFilterAll')}
            >
              <option value="all">{t('serverControl.deployLogFilterAll')}</option>
              <option value="backend">{t('serverControl.deployLogFilterBackend')}</option>
              <option value="frontend">{t('serverControl.deployLogFilterFrontend')}</option>
            </Select>
          </div>
          <Field label={t('serverControl.deployLogSelect')} className="min-w-[16rem] flex-1">
            <Select
              value={selectedLogName}
              onChange={(e) => setSelectedLogName(e.target.value)}
              disabled={!adminToken || deployLogs.length === 0}
            >
              <option value="">{t('serverControl.deployLogSelectPlaceholder')}</option>
              {deployLogs.map((log) => (
                <option key={log.name} value={log.name}>
                  {log.name} —{' '}
                  {log.finished
                    ? t('serverControl.deployLogStatusDone')
                    : t('serverControl.deployLogStatusRunning')}{' '}
                  ({formatBytes(log.sizeBytes)})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {logRunning ? (
          <p className="mb-3 text-sm text-sky-700 dark:text-sky-300">
            {t('serverControl.deployLogAutoRefresh')}
          </p>
        ) : null}

        {deployLogError ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{deployLogError}</p>
        ) : null}

        {deployLogContent?.truncated ? (
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
            {t('serverControl.deployLogTruncated')}
          </p>
        ) : null}

        {deployLogContent &&
        detectNpmError(deployLogContent.content) &&
        selectedLog ? (
          <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {t('serverControl.deployLogNpmErrorDetected', { kind: selectedLog.kind })}
          </p>
        ) : null}

        <pre className="min-h-[12rem] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-4 font-mono text-xs leading-relaxed text-gray-100">
          {deployLogContent?.content?.trim()
            ? deployLogContent.content
            : t('serverControl.deployLogEmpty')}
        </pre>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('serverControl.envFilesTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
          {t('serverControl.envFilesHint')}
        </p>
        <div className="mt-4 space-y-4">
          {renderEnvSection('backend')}
          {renderEnvSection('frontend')}
          {renderEnvSection('frontend-production')}
        </div>
      </Card>
    </div>
  );
}
