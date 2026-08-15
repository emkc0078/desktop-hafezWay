import { useCallback, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { generateCurlCommand, highlightJSON } from '@/utils/jsonHighlight';
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

type LogStats = {
  total: number;
  averageResponseTime: number;
  errorRate: number;
  totalRequests24h: number;
  methods?: Record<string, number>;
  statusCodes?: Record<string, number>;
};

type LogRow = {
  id: number;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  responseTime: number;
  ip: string;
  userAgent?: string;
};

type LogDetail = LogRow & {
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: unknown;
};

type StatsResponse = { data?: LogStats };
type LogsListResponse = {
  data?: {
    logs: LogRow[];
    total: number;
    pagination: { limit: number; offset: number; hasMore: boolean };
  };
};
type LogDetailResponse = { data?: LogDetail };

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const STATUS_OPTIONS = [
  { value: '', labelKey: 'allStatuses' as const },
  { value: 'failed', labelKey: 'failed' as const },
  { value: '200', labelKey: null },
  { value: '201', labelKey: null },
  { value: '400', labelKey: null },
  { value: '401', labelKey: null },
  { value: '404', labelKey: null },
  { value: '500', labelKey: null },
];
const LIMIT_OPTIONS = ['10', '25', '50', '100'];

function statusBadgeClass(status: number): string {
  const base = 'inline-block rounded px-2 py-0.5 text-xs font-semibold';
  if (status >= 500) return `${base} bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200`;
  if (status >= 400) return `${base} bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200`;
  if (status >= 300) return `${base} bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200`;
  if (status >= 200) return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200`;
  return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
}

function methodBadgeClass(method: string): string {
  const base = 'inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase';
  switch (method.toUpperCase()) {
    case 'GET':
      return `${base} bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200`;
    case 'POST':
      return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200`;
    case 'PUT':
    case 'PATCH':
      return `${base} bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200`;
    case 'DELETE':
      return `${base} bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200`;
    default:
      return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
  }
}

function JsonBlock({
  title,
  content,
  isError = false,
  emptyText,
}: {
  title: string;
  content: unknown;
  isError?: boolean;
  emptyText?: string;
}) {
  const html = useMemo(() => {
    if (content == null || (typeof content === 'object' && Object.keys(content as object).length === 0)) {
      return emptyText ?? '—';
    }
    if (typeof content === 'string' && !content.startsWith('{') && !content.startsWith('[')) {
      return content;
    }
    return highlightJSON(content, isError);
  }, [content, emptyText, isError]);

  const isPlain = typeof html === 'string' && !html.includes('<span');

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold dark:border-gray-600 dark:bg-gray-900">
        {title}
      </div>
      {isPlain ? (
        <div className="px-3 py-2 text-sm text-text-secondary dark:text-gray-300">{html}</div>
      ) : (
        <pre
          className="json-content max-h-64 overflow-auto px-3 py-2 text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

export function HttpLogsPanel() {
  const t = useT();
  const { logsApiBase, serverUrl, adminToken } = useAdminSettings();

  const [stats, setStats] = useState<LogStats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, hasMore: false });

  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [urlSearch, setUrlSearch] = useState('');
  const [limitFilter, setLimitFilter] = useState('50');

  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLog, setDetailLog] = useState<LogDetail | null>(null);

  const filteredLogs = useMemo(() => {
    const q = urlSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => log.url.toLowerCase().includes(q));
  }, [logs, urlSearch]);

  const loadStats = useCallback(async () => {
    if (!adminToken) return;
    setLoadingStats(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<StatsResponse>(`${logsApiBase}/logs/stats`, adminToken);
      setStats(res.data ?? null);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoadingStats(false);
    }
  }, [adminToken, logsApiBase, t]);

  const buildLogsUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({
        limit: limitFilter,
        offset: String(offset),
      });
      if (methodFilter) params.set('method', methodFilter);
      if (statusFilter === 'failed') {
        params.set('statusGroup', 'failed');
      } else if (statusFilter) {
        params.set('status', statusFilter);
      }
      return `${logsApiBase}/logs?${params.toString()}`;
    },
    [limitFilter, logsApiBase, methodFilter, statusFilter],
  );

  const loadLogs = useCallback(
    async (offset = 0) => {
      if (!adminToken) return;
      setLoadingLogs(true);
      setMessage(null);
      try {
        const res = await adminFetchJson<LogsListResponse>(buildLogsUrl(offset), adminToken);
        const data = res.data;
        setLogs(data?.logs ?? []);
        setTotal(data?.total ?? 0);
        setPagination(
          data?.pagination ?? {
            limit: parseInt(limitFilter, 10) || 50,
            offset,
            hasMore: false,
          },
        );
      } catch (e) {
        if (isAdminSessionExpiredError(e)) return;
        setMessage({
          type: 'err',
          text: e instanceof Error ? e.message : t('common.error'),
        });
        setLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    },
    [adminToken, buildLogsUrl, limitFilter, t],
  );

  const openDetail = async (logId: number) => {
    if (!adminToken) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailLog(null);
    try {
      const res = await adminFetchJson<LogDetailResponse>(
        `${logsApiBase}/logs/${logId}`,
        adminToken,
      );
      setDetailLog(res.data ?? null);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) {
        setDetailOpen(false);
        return;
      }
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const clearFilters = () => {
    setMethodFilter('');
    setStatusFilter('');
    setUrlSearch('');
    setLimitFilter('50');
  };

  const clearAllLogs = async () => {
    if (!adminToken) return;
    if (!window.confirm(t('httpLogs.clearAllConfirm'))) return;
    setLoadingLogs(true);
    try {
      await adminFetchJson(`${logsApiBase}/logs`, adminToken, { method: 'DELETE' });
      setMessage({ type: 'ok', text: t('httpLogs.logsCleared') });
      setLogs([]);
      setTotal(0);
      await loadStats();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoadingLogs(false);
    }
  };

  const copyCurl = async () => {
    if (!detailLog) return;
    const cmd = generateCurlCommand(detailLog, logsApiBase, serverUrl, adminToken);
    try {
      await navigator.clipboard.writeText(cmd);
      setMessage({ type: 'ok', text: t('httpLogs.copied') });
    } catch {
      setMessage({ type: 'err', text: t('common.error') });
    }
  };

  const formatResponseBodyForCopy = (body: unknown): string => {
    if (body == null) return 'No response body available';
    if (typeof body === 'string') {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    if (typeof body === 'object') {
      return JSON.stringify(body, null, 2);
    }
    return String(body);
  };

  const copyCurlAndResponse = async () => {
    if (!detailLog) return;
    const cmd = generateCurlCommand(detailLog, logsApiBase, serverUrl, adminToken);
    const responseText = formatResponseBodyForCopy(
      detailLog.responseBody ?? detailLog.error,
    );
    const combined = `# cURL Command\n${cmd}\n\n# Response Body\n${responseText}`;
    try {
      await navigator.clipboard.writeText(combined);
      setMessage({ type: 'ok', text: t('httpLogs.copiedCurlAndResponse') });
    } catch {
      setMessage({ type: 'err', text: t('common.error') });
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const statusLabel = (value: string) => {
    if (!value) return t('httpLogs.allStatuses');
    if (value === 'failed') return t('httpLogs.failed');
    return value;
  };

  return (
    <div className="http-logs-panel space-y-6">
      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('httpLogs.title')}</h2>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={() => void loadStats()} disabled={loadingStats}>
              {loadingStats ? t('common.loading') : t('httpLogs.loadStats')}
            </Btn>
            <Btn variant="primary" onClick={() => void loadLogs(0)} disabled={loadingLogs}>
              {loadingLogs ? t('common.loading') : t('httpLogs.loadLogs')}
            </Btn>
            <Btn variant="danger" onClick={() => void clearAllLogs()} disabled={loadingLogs}>
              {t('httpLogs.clearLogs')}
            </Btn>
          </div>
        </div>

        {stats ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-600 dark:bg-gray-900">
              <div className="text-2xl font-bold text-brand-primary">{stats.total}</div>
              <div className="mt-1 text-sm text-text-secondary dark:text-gray-300">
                {t('httpLogs.statsTotal')}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-600 dark:bg-gray-900">
              <div className="text-2xl font-bold text-brand-primary">
                {stats.averageResponseTime}ms
              </div>
              <div className="mt-1 text-sm text-text-secondary dark:text-gray-300">
                {t('httpLogs.statsAvg')}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-600 dark:bg-gray-900">
              <div className="text-2xl font-bold text-brand-primary">{stats.errorRate}%</div>
              <div className="mt-1 text-sm text-text-secondary dark:text-gray-300">
                {t('httpLogs.statsErrorRate')}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-600 dark:bg-gray-900">
              <div className="text-2xl font-bold text-brand-primary">{stats.totalRequests24h}</div>
              <div className="mt-1 text-sm text-text-secondary dark:text-gray-300">
                {t('httpLogs.statsLast24h')}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('httpLogs.method')}>
            <Select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="">{t('httpLogs.allMethods')}</option>
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('httpLogs.status')}>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.labelKey ? t(`httpLogs.${opt.labelKey}`) : statusLabel(opt.value)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('httpLogs.searchUrl')}>
            <Input
              value={urlSearch}
              onChange={(e) => setUrlSearch(e.target.value)}
              placeholder={t('httpLogs.searchUrl')}
            />
          </Field>
          <Field label={t('httpLogs.limit')}>
            <Select value={limitFilter} onChange={(e) => setLimitFilter(e.target.value)}>
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Btn variant="secondary" onClick={clearFilters}>
              {t('httpLogs.clearFilters')}
            </Btn>
          </div>
        </div>
      </Card>

      <Card>
        <div className="http-logs-table">
          <TableShell
            colWidths={['18%', '8%', '34%', '10%', '12%', '18%']}
            minWidth={1400}
          >
            <thead>
              <tr>
                <th className={tableHeadClass}>Timestamp</th>
                <th className={tableHeadClass}>{t('httpLogs.method')}</th>
                <th className={tableHeadClass}>URL</th>
                <th className={tableHeadClass}>{t('httpLogs.status')}</th>
                <th className={tableHeadClass}>Response time</th>
                <th className={tableHeadClass}>IP</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tableCellClass} py-8 text-center text-text-muted`}>
                    {loadingLogs ? t('common.loading') : t('httpLogs.noLogs')}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => void openDetail(log.id)}
                    title={t('httpLogs.detailTitle')}
                  >
                    <td className={tableCellClass}>{formatTimestamp(log.timestamp)}</td>
                    <td className={tableCellClass}>
                      <span className={methodBadgeClass(log.method)}>{log.method}</span>
                    </td>
                    <td className={`${tableCellClass} max-w-xs truncate`} title={log.url}>
                      {log.url}
                    </td>
                    <td className={tableCellClass}>
                      <span className={statusBadgeClass(log.status)}>{log.status}</span>
                    </td>
                    <td className={tableCellClass}>{log.responseTime}ms</td>
                    <td className={tableCellClass}>{log.ip}</td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </div>

        {total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-text-secondary dark:text-gray-300">
              {t('common.pageOf', {
                page: Math.floor(pagination.offset / pagination.limit) + 1,
                pages: Math.max(1, Math.ceil(total / pagination.limit)),
                total,
              })}
            </span>
            <div className="flex gap-2">
              <Btn
                variant="secondary"
                disabled={pagination.offset <= 0 || loadingLogs}
                onClick={() => void loadLogs(Math.max(0, pagination.offset - pagination.limit))}
              >
                {t('common.previous')}
              </Btn>
              <Btn
                variant="secondary"
                disabled={!pagination.hasMore || loadingLogs}
                onClick={() => void loadLogs(pagination.offset + pagination.limit)}
              >
                {t('common.next')}
              </Btn>
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        open={detailOpen}
        title={t('httpLogs.detailTitleWide')}
        onClose={() => setDetailOpen(false)}
        maxWidthClass="max-w-5xl"
      >
        {detailLoading ? (
          <p className="text-sm text-text-secondary dark:text-gray-300">{t('common.loading')}</p>
        ) : detailLog ? (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="info" onClick={() => void copyCurl()}>
                {t('httpLogs.copyCurl')}
              </Btn>
              <Btn variant="info" onClick={() => void copyCurlAndResponse()}>
                {t('httpLogs.copyCurlAndResponse')}
              </Btn>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold dark:border-gray-600 dark:bg-gray-900">
                Basic information
              </div>
              <dl className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-text-muted">ID</dt>
                  <dd>{detailLog.id}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-muted">Timestamp</dt>
                  <dd>{formatTimestamp(detailLog.timestamp)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-muted">{t('httpLogs.method')}</dt>
                  <dd>{detailLog.method}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-muted">{t('httpLogs.status')}</dt>
                  <dd>{detailLog.status}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-text-muted">URL</dt>
                  <dd className="break-all">{detailLog.url}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-muted">Response time</dt>
                  <dd>{detailLog.responseTime}ms</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-muted">IP</dt>
                  <dd>{detailLog.ip}</dd>
                </div>
                {detailLog.userAgent ? (
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-text-muted">User agent</dt>
                    <dd className="break-all text-text-secondary dark:text-gray-300">
                      {detailLog.userAgent}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <JsonBlock
              title="Request headers"
              content={detailLog.requestHeaders}
              emptyText="No request headers captured"
            />
            <JsonBlock
              title="Response headers"
              content={detailLog.responseHeaders}
              emptyText="No response headers captured"
            />
            <JsonBlock
              title="Request body"
              content={detailLog.requestBody}
              emptyText={
                detailLog.method === 'GET'
                  ? 'GET requests typically have no body'
                  : 'No request body captured'
              }
            />
            <JsonBlock
              title="Response body"
              content={detailLog.responseBody}
              isError={detailLog.status >= 400}
              emptyText="No response body captured"
            />
            {detailLog.error != null ? (
              <JsonBlock title="Error details" content={detailLog.error} isError />
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
