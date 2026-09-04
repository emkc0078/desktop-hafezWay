import { useCallback, useEffect, useState } from 'react';
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
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';

type NewsletterSubscriber = {
  id: string;
  email: string;
  source?: string;
  locale?: string | null;
  createdAt?: string;
};

type ListResponse = {
  data?: {
    subscribers?: NewsletterSubscriber[];
    pagination?: { page: number; limit: number; total: number; pages: number };
  };
};

export function NewsletterSubscribersPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [rows, setRows] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: '50',
      });
      if (search.trim()) q.set('search', search.trim());
      const res = await adminFetchJson<ListResponse>(
        `${logsApiBase}/newsletter/admin?${q.toString()}`,
        adminToken,
      );
      setRows(res.data?.subscribers ?? []);
      setPages(res.data?.pagination?.pages ?? 1);
      setTotal(res.data?.pagination?.total ?? 0);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, logsApiBase, page, search, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: NewsletterSubscriber) => {
    if (!adminToken) return;
    if (!window.confirm(t('newsletterSubscribers.confirmDelete', { email: row.email }))) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await adminFetchJson(`${logsApiBase}/newsletter/admin/${row.id}`, adminToken, {
        method: 'DELETE',
      });
      setMessage({ type: 'ok', text: t('newsletterSubscribers.deleted') });
      await load();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('newsletterSubscribers.title')}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {t('newsletterSubscribers.subtitle')}
          </p>
        </div>
        <Btn variant="info" onClick={() => void load()} disabled={loading}>
          {t('common.refresh')}
        </Btn>
      </div>

      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
        />
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('newsletterSubscribers.search')} className="min-w-[220px] flex-1">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                setSearch(searchInput.trim());
              }
            }}
            placeholder={t('newsletterSubscribers.searchPlaceholder')}
          />
        </Field>
        <Btn
          variant="secondary"
          disabled={loading}
          onClick={() => {
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          {t('newsletterSubscribers.search')}
        </Btn>
      </div>

      <p className="mb-2 text-sm text-text-muted">
        {t('newsletterSubscribers.total', { count: total })}
      </p>

      <TableShell>
        <thead>
          <tr>
            <th className={tableHeadClass}>{t('newsletterSubscribers.cols.email')}</th>
            <th className={tableHeadClass}>{t('newsletterSubscribers.cols.source')}</th>
            <th className={tableHeadClass}>{t('newsletterSubscribers.cols.locale')}</th>
            <th className={tableHeadClass}>{t('newsletterSubscribers.cols.date')}</th>
            <th className={tableHeadClass}>{t('newsletterSubscribers.cols.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td className={tableCellClass} colSpan={5}>
                {t('newsletterSubscribers.empty')}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} break-all`}>{row.email}</td>
              <td className={tableCellClass}>{row.source || '—'}</td>
              <td className={tableCellClass}>{row.locale || '—'}</td>
              <td className={tableCellClass}>
                {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
              </td>
              <td className={tableCellClass}>
                <Btn variant="danger" onClick={() => void remove(row)} disabled={loading}>
                  {t('common.delete')}
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      {pages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn
            variant="secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('common.previous')}
          </Btn>
          <span className="text-sm text-text-muted">
            {t('common.pageOf', { page, pages, total })}
          </span>
          <Btn
            variant="secondary"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            {t('common.next')}
          </Btn>
        </div>
      ) : null}
    </Card>
  );
}
