import { useCallback, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import {
  Btn,
  Card,
  Field,
  Input,
  MessageBanner,
  TableShell,
  TextArea,
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';

type ApiEnvelope<T> = { success?: boolean; message?: string; data: T };

type CacheStats = {
  totalKeys?: number;
  usedMemory?: string;
  hitRate?: string;
};

type RedisStats = {
  commands_processed?: string;
  hit_rate?: string;
};

type KeyDetail = {
  key: string;
  type: string;
  ttl: string;
  size: string;
  expires?: string | null;
};

type KeysPage = {
  keys: (string | KeyDetail)[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

type RedisLogEntry = {
  timestamp: string;
  level: string;
  message: string;
  operation?: string;
  key?: string;
};

type Overview = {
  totalKeys: string;
  usedMemory: string;
  hitRate: string;
  commandsProcessed: string;
};

function isKeyDetail(k: string | KeyDetail): k is KeyDetail {
  return typeof k === 'object' && k !== null && 'key' in k;
}

export function RedisPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  const [pattern, setPattern] = useState('*');
  const [limit, setLimit] = useState('100');
  const [offset, setOffset] = useState('0');
  const [detailed, setDetailed] = useState(false);
  const [keysPage, setKeysPage] = useState<KeysPage | null>(null);

  const [specificKey, setSpecificKey] = useState('');
  const [newTtl, setNewTtl] = useState('');
  const [keyValue, setKeyValue] = useState('');

  const [logsLimit, setLogsLimit] = useState('100');
  const [operationFilter, setOperationFilter] = useState('');
  const [redisLogs, setRedisLogs] = useState<RedisLogEntry[]>([]);

  const showErr = useCallback(
    (e: unknown) => {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    },
    [t],
  );

  const refreshOverview = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      let cache: CacheStats = {};
      let stats: RedisStats = {};

      try {
        const cacheRes = await adminFetchJson<ApiEnvelope<CacheStats>>(
          `${logsApiBase}/redis/cache-stats`,
          adminToken,
        );
        cache = cacheRes.data ?? {};
      } catch {
        /* cache-stats optional */
      }

      try {
        const statsRes = await adminFetchJson<ApiEnvelope<RedisStats>>(
          `${logsApiBase}/redis/stats`,
          adminToken,
        );
        stats = statsRes.data ?? {};
      } catch {
        /* stats optional */
      }

      setOverview({
        totalKeys: cache.totalKeys != null ? String(cache.totalKeys) : t('common.na'),
        usedMemory: cache.usedMemory ?? t('common.na'),
        hitRate: cache.hitRate ?? stats.hit_rate ?? t('common.na'),
        commandsProcessed: stats.commands_processed ?? t('common.na'),
      });
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, logsApiBase, showErr, t]);

  const searchKeys = useCallback(
    async (offsetOverride?: number) => {
      if (!adminToken) return;
      const offsetNum = offsetOverride ?? (parseInt(offset, 10) || 0);
      setOffset(String(offsetNum));
      setLoading(true);
      setMessage(null);
      try {
        const params = new URLSearchParams({
          pattern,
          limit,
          offset: String(offsetNum),
          detailed: String(detailed),
        });
        const res = await adminFetchJson<ApiEnvelope<KeysPage>>(
          `${logsApiBase}/redis/keys?${params}`,
          adminToken,
        );
        setKeysPage(res.data);
      } catch (e) {
        showErr(e);
      } finally {
        setLoading(false);
      }
    },
    [adminToken, detailed, limit, logsApiBase, offset, pattern, showErr],
  );

  const selectKey = (key: string) => {
    setSpecificKey(key);
    setKeyValue('');
  };

  const getKey = async () => {
    if (!adminToken || !specificKey.trim()) return;
    setLoading(true);
    try {
      const res = await adminFetchJson<ApiEnvelope<unknown>>(
        `${logsApiBase}/redis/get?key=${encodeURIComponent(specificKey.trim())}`,
        adminToken,
      );
      setKeyValue(
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2),
      );
      setMessage({ type: 'ok', text: res.message ?? t('common.success') });
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const deleteKey = async () => {
    if (!adminToken || !specificKey.trim()) return;
    if (!window.confirm(`${t('redis.deleteKey')}: ${specificKey.trim()}?`)) return;
    setLoading(true);
    try {
      await adminFetchJson(`${logsApiBase}/redis/delete`, adminToken, {
        method: 'DELETE',
        body: JSON.stringify({ key: specificKey.trim() }),
      });
      setMessage({ type: 'ok', text: t('common.deleted') });
      setKeyValue('');
      await searchKeys();
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const setKeyTtl = async () => {
    if (!adminToken) return;
    const key = specificKey.trim();
    const ttlStr = newTtl.trim();
    if (!key || !ttlStr) {
      setMessage({ type: 'err', text: t('redis.keyTtlRequired') });
      return;
    }
    const ttl = parseInt(ttlStr, 10);
    if (Number.isNaN(ttl) || ttl < 0) {
      setMessage({ type: 'err', text: t('redis.ttlNonNegative') });
      return;
    }
    setLoading(true);
    try {
      await adminFetchJson(`${logsApiBase}/redis/key/ttl`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({ key, ttl }),
      });
      setMessage({ type: 'ok', text: t('common.success') });
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const flushDb = async () => {
    if (!adminToken) return;
    if (!window.confirm(t('redis.confirmFlush'))) return;
    setLoading(true);
    try {
      const res = await adminFetchJson<ApiEnvelope<{ deletedCount?: number }>>(
        `${logsApiBase}/redis/clear-all`,
        adminToken,
        { method: 'DELETE', body: JSON.stringify({ prefix: 'api' }) },
      );
      setMessage({
        type: 'ok',
        text: res.message ?? t('common.success'),
      });
      await refreshOverview();
      await searchKeys();
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const flushAll = async () => {
    if (!adminToken) return;
    if (!window.confirm(t('redis.confirmFlushAll'))) return;
    setLoading(true);
    try {
      const res = await adminFetchJson<ApiEnvelope<null>>(
        `${logsApiBase}/redis/flush-all`,
        adminToken,
        { method: 'DELETE' },
      );
      setMessage({ type: 'ok', text: res.message ?? t('common.success') });
      setKeysPage(null);
      setKeyValue('');
      await refreshOverview();
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: logsLimit });
      if (operationFilter.trim()) params.set('operation', operationFilter.trim());
      const res = await adminFetchJson<ApiEnvelope<RedisLogEntry[]>>(
        `${logsApiBase}/redis/logs?${params}`,
        adminToken,
      );
      setRedisLogs(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!adminToken) return;
    if (!window.confirm(t('redis.confirmClearLogs'))) return;
    setLoading(true);
    try {
      await adminFetchJson(`${logsApiBase}/redis/logs/clear`, adminToken, {
        method: 'DELETE',
      });
      setRedisLogs([]);
      setMessage({ type: 'ok', text: t('common.success') });
    } catch (e) {
      showErr(e);
    } finally {
      setLoading(false);
    }
  };

  const pageNum = keysPage ? Math.floor(keysPage.offset / keysPage.limit) + 1 : 1;
  const totalPages = keysPage
    ? Math.max(1, Math.ceil(keysPage.total / keysPage.limit))
    : 1;

  const goPrev = () => {
    const n = Math.max(0, parseInt(offset, 10) - parseInt(limit, 10));
    void searchKeys(n);
  };

  const goNext = () => {
    if (!keysPage?.hasMore) return;
    const n = parseInt(offset, 10) + parseInt(limit, 10);
    void searchKeys(n);
  };

  return (
    <div className="space-y-6">
      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('redis.title')}</h2>
          <Btn variant="secondary" onClick={() => void refreshOverview()} disabled={loading}>
            {loading ? t('redis.refreshing') : t('redis.refreshOverview')}
          </Btn>
        </div>
        {overview ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
              <div className="text-xs text-text-muted">{t('redis.totalKeys')}</div>
              <div className="text-lg font-semibold">{overview.totalKeys}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
              <div className="text-xs text-text-muted">{t('redis.usedMemory')}</div>
              <div className="text-lg font-semibold">{overview.usedMemory}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
              <div className="text-xs text-text-muted">{t('redis.hitRate')}</div>
              <div className="text-lg font-semibold">{overview.hitRate}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
              <div className="text-xs text-text-muted">{t('redis.commandsProcessed')}</div>
              <div className="text-lg font-semibold">{overview.commandsProcessed}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary dark:text-gray-300">
            {t('redis.refreshOverview')}
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-4 text-base font-semibold">{t('redis.searchKeys')}</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label={t('redis.pattern')}>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} />
          </Field>
          <Field label={t('redis.limit')}>
            <Input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
          <Field label={t('redis.offset')}>
            <Input
              type="number"
              min={0}
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={detailed}
              onChange={(e) => setDetailed(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('redis.detailedKeys')}
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => void searchKeys()} disabled={loading}>
            {t('redis.searchKeys')}
          </Btn>
          {keysPage && totalPages > 1 ? (
            <>
              <Btn variant="secondary" onClick={goPrev} disabled={parseInt(offset, 10) <= 0}>
                {t('common.previous')}
              </Btn>
              <span className="self-center text-sm text-text-muted">
                {t('common.pageOf', { page: pageNum, pages: totalPages, total: keysPage.total })}
              </span>
              <Btn variant="secondary" onClick={goNext} disabled={!keysPage.hasMore}>
                {t('common.next')}
              </Btn>
            </>
          ) : null}
        </div>

        {keysPage ? (
          <div className="mt-4">
            {keysPage.keys.length === 0 ? (
              <p className="text-sm text-text-muted">—</p>
            ) : detailed ? (
              <TableShell colWidths={['40%', '12%', '18%', '14%', '16%']}>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Key</th>
                    <th className={tableHeadClass}>Type</th>
                    <th className={tableHeadClass}>TTL</th>
                    <th className={tableHeadClass}>Size</th>
                    <th className={tableHeadClass} />
                  </tr>
                </thead>
                <tbody>
                  {keysPage.keys.map((row) => {
                    const k = isKeyDetail(row) ? row : { key: row, type: '', ttl: '', size: '' };
                    return (
                      <tr key={k.key} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50">
                        <td
                          className={`${tableCellClass} max-w-xs truncate font-mono text-xs`}
                          title={k.key}
                          onClick={() => selectKey(k.key)}
                        >
                          {k.key}
                        </td>
                        <td className={tableCellClass}>{isKeyDetail(row) ? row.type : '—'}</td>
                        <td className={tableCellClass}>{isKeyDetail(row) ? row.ttl : '—'}</td>
                        <td className={tableCellClass}>{isKeyDetail(row) ? row.size : '—'}</td>
                        <td className={tableCellClass}>
                          <Btn variant="secondary" onClick={() => selectKey(k.key)}>
                            {t('common.select')}
                          </Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            ) : (
              <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-600">
                {keysPage.keys.map((row) => {
                  const key = isKeyDetail(row) ? row.key : row;
                  return (
                    <li
                      key={key}
                      className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                      onClick={() => selectKey(key)}
                    >
                      <span className="min-w-0 truncate font-mono text-xs">{key}</span>
                      <Btn variant="secondary" onClick={() => selectKey(key)}>
                        {t('common.select')}
                      </Btn>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-4 text-base font-semibold">{t('redis.specificKey')}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('redis.specificKey')}>
            <Input
              value={specificKey}
              onChange={(e) => setSpecificKey(e.target.value)}
              placeholder={t('redis.keyPlaceholder')}
            />
          </Field>
          <Field label={t('redis.newTtl')}>
            <Input
              type="number"
              min={0}
              value={newTtl}
              onChange={(e) => setNewTtl(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="info" onClick={() => void getKey()} disabled={loading}>
            {t('redis.getKey')}
          </Btn>
          <Btn variant="danger" onClick={() => void deleteKey()} disabled={loading}>
            {t('redis.deleteKey')}
          </Btn>
          <Btn variant="success" onClick={() => void setKeyTtl()} disabled={loading}>
            {t('common.save')} TTL
          </Btn>
          <Btn variant="warning" onClick={() => void flushDb()} disabled={loading}>
            {t('redis.flushDb')}
          </Btn>
          <Btn variant="danger" onClick={() => void flushAll()} disabled={loading}>
            {t('redis.flushDb')} (all)
          </Btn>
        </div>
        {keyValue ? (
          <div className="mt-4">
            <Field label={t('redis.getKey')}>
              <TextArea rows={8} readOnly value={keyValue} className="font-mono text-xs" />
            </Field>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{t('redis.logs')}</h3>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={() => void loadLogs()} disabled={loading}>
              {t('redis.loadLogs')}
            </Btn>
            <Btn variant="danger" onClick={() => void clearLogs()} disabled={loading}>
              {t('common.clear')}
            </Btn>
          </div>
        </div>
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Field label={t('redis.limit')}>
            <Input
              type="number"
              min={1}
              value={logsLimit}
              onChange={(e) => setLogsLimit(e.target.value)}
            />
          </Field>
          <Field label={t('redis.operationFilter')}>
            <Input
              value={operationFilter}
              onChange={(e) => setOperationFilter(e.target.value)}
              placeholder="cache_clear"
            />
          </Field>
        </div>
        {redisLogs.length > 0 ? (
          <TableShell minWidth={640}>
            <thead>
              <tr>
                <th className={tableHeadClass}>Time</th>
                <th className={tableHeadClass}>Level</th>
                <th className={tableHeadClass}>Operation</th>
                <th className={tableHeadClass}>Message</th>
              </tr>
            </thead>
            <tbody>
              {redisLogs.map((row, i) => (
                <tr key={`${row.timestamp}-${i}`}>
                  <td className={`${tableCellClass} whitespace-nowrap text-xs`}>
                    {row.timestamp}
                  </td>
                  <td className={tableCellClass}>{row.level}</td>
                  <td className={tableCellClass}>{row.operation ?? '—'}</td>
                  <td className={`${tableCellClass} max-w-md truncate`} title={row.message}>
                    {row.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <p className="text-sm text-text-muted">{t('redis.loadLogs')}</p>
        )}
      </Card>
    </div>
  );
}
