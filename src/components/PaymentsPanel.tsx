import { useCallback, useEffect, useRef, useState } from 'react';
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
  Modal,
  Select,
  TableShell,
  TextArea,
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';

type PaymentStatus = 'pending' | 'approved' | 'rejected';
type StatusFilter = PaymentStatus | 'all';

type PaymentUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  signupPlan?: string | null;
  subscriptionEndsAt?: string | null;
};

type PaymentRow = {
  id: string;
  kind: 'vodafone_cash' | 'unable_to_pay';
  status: PaymentStatus;
  planKey: string;
  amount: number | null;
  currency: string;
  periodDays: number;
  transferNumber: string | null;
  receiptImage: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  activatedUntil: string | null;
  user?: PaymentUser | null;
};

type StatusCounts = {
  pending: number;
  approved: number;
  rejected: number;
  all: number;
};

type Settings = {
  vodafoneCashNumber: string;
  vodafoneCashName: string;
  instructionsAr: string;
  instructionsEn: string;
};

type Pagination = {
  page: number;
  pages: number;
  total: number;
  hasPrev?: boolean;
  hasNext?: boolean;
};

function receiptUrl(serverUrl: string, path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = serverUrl.replace(/\/$/, '');
  return path.startsWith('uploads/') ? `${base}/${path}` : `${base}/uploads/${path}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function studentName(row: PaymentRow): string {
  const name = `${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim();
  return name || row.user?.email || row.id;
}

export function PaymentsPanel({
  active = true,
  onPendingCountChange,
}: {
  active?: boolean;
  onPendingCountChange?: (count: number) => void;
}) {
  const t = useT();
  const { logsApiBase, serverUrl, adminToken } = useAdminSettings();
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [counts, setCounts] = useState<StatusCounts>({
    pending: 0,
    approved: 0,
    rejected: 0,
    all: 0,
  });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [settings, setSettings] = useState<Settings>({
    vodafoneCashNumber: '',
    vodafoneCashName: '',
    instructionsAr: '',
    instructionsEn: '',
  });
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const searchRef = useRef(search);
  const pendingCbRef = useRef(onPendingCountChange);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    pendingCbRef.current = onPendingCountChange;
  }, [onPendingCountChange]);

  const loadSettings = useCallback(async () => {
    if (!adminToken) return;
    try {
      const res = await adminFetchJson<{ data?: { settings?: Settings } }>(
        `${logsApiBase}/payments/admin/settings`,
        adminToken,
      );
      const s = res.data?.settings;
      if (s) setSettings(s);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
    }
  }, [adminToken, logsApiBase]);

  const loadPayments = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '20',
        status,
      });
      if (searchRef.current.trim()) qs.set('search', searchRef.current.trim());
      const res = await adminFetchJson<{
        data?: {
          payments?: PaymentRow[];
          pendingCount?: number;
          statusCounts?: StatusCounts;
          pagination?: Pagination;
        };
      }>(`${logsApiBase}/payments/admin?${qs.toString()}`, adminToken);
      const nextCounts = res.data?.statusCounts ?? {
        pending: res.data?.pendingCount ?? 0,
        approved: 0,
        rejected: 0,
        all: 0,
      };
      setRows(res.data?.payments ?? []);
      setCounts(nextCounts);
      setPagination(res.data?.pagination ?? { page: 1, pages: 1, total: 0 });
      pendingCbRef.current?.(nextCounts.pending);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, logsApiBase, page, status, t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (!adminToken) return;
    const id = window.setInterval(() => {
      void loadPayments();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [adminToken, loadPayments]);

  const changeStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  const saveSettings = async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      await adminFetchJson(`${logsApiBase}/payments/admin/settings`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setMessage({ type: 'ok', text: t('dashboard.payments.settingsSaved') });
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id: string) => {
    if (!adminToken) return;
    if (!window.confirm(t('dashboard.payments.confirmApprove'))) return;
    setLoading(true);
    setMessage(null);
    try {
      await adminFetchJson(`${logsApiBase}/payments/admin/${id}/approve`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setSelected(null);
      setMessage({ type: 'ok', text: t('dashboard.payments.approved') });
      await loadPayments();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const reject = async () => {
    const id = selected?.id;
    if (!adminToken || !id) return;
    setLoading(true);
    setMessage(null);
    try {
      await adminFetchJson(`${logsApiBase}/payments/admin/${id}/reject`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ note: rejectNote.trim() }),
      });
      setRejectOpen(false);
      setRejectNote('');
      setSelected(null);
      setMessage({ type: 'ok', text: t('dashboard.payments.rejected') });
      await loadPayments();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (value: PaymentStatus) =>
    value === 'pending'
      ? t('dashboard.payments.statusPending')
      : value === 'approved'
        ? t('dashboard.payments.statusApproved')
        : t('dashboard.payments.statusRejected');

  const statusClass = (value: PaymentStatus) =>
    value === 'pending'
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
      : value === 'approved'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';

  const summaryCards: { id: StatusFilter; label: string; value: number; activeClass: string }[] = [
    {
      id: 'pending',
      label: t('dashboard.payments.countPending'),
      value: counts.pending,
      activeClass: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40',
    },
    {
      id: 'approved',
      label: t('dashboard.payments.countApproved'),
      value: counts.approved,
      activeClass: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      id: 'rejected',
      label: t('dashboard.payments.countRejected'),
      value: counts.rejected,
      activeClass: 'border-red-500 bg-red-50 dark:bg-red-950/40',
    },
    {
      id: 'all',
      label: t('dashboard.payments.countAll'),
      value: counts.all,
      activeClass: 'border-brand-primary bg-sky-50 dark:bg-sky-950/40',
    },
  ];

  const selectedReceipt = selected ? receiptUrl(serverUrl, selected.receiptImage) : null;

  return (
    <div className={active ? 'space-y-6' : 'hidden'}>
      {message ? <MessageBanner type={message.type === 'ok' ? 'success' : 'error'} text={message.text} /> : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('dashboard.payments.ordersTitle')}</h2>
            <p className="text-sm text-text-muted">{t('dashboard.payments.subtitle')}</p>
          </div>
          <Btn variant="secondary" onClick={() => void loadPayments()} disabled={loading}>
            {t('dashboard.payments.refresh')}
          </Btn>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => changeStatus(card.id)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                status === card.id
                  ? card.activeClass
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
              }`}
            >
              <div className="text-sm text-text-muted">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold">{card.value}</div>
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder={t('dashboard.payments.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                void loadPayments();
              }
            }}
            onBlur={() => {
              setPage(1);
              void loadPayments();
            }}
          />
          <Select
            value={status}
            onChange={(e) => changeStatus(e.target.value as StatusFilter)}
          >
            <option value="pending">{t('dashboard.payments.statusPending')}</option>
            <option value="approved">{t('dashboard.payments.statusApproved')}</option>
            <option value="rejected">{t('dashboard.payments.statusRejected')}</option>
            <option value="all">{t('dashboard.payments.statusAll')}</option>
          </Select>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">{t('dashboard.payments.noPayments')}</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th className={tableHeadClass}>{t('dashboard.payments.student')}</th>
                <th className={tableHeadClass}>{t('dashboard.payments.amount')}</th>
                <th className={tableHeadClass}>{t('dashboard.payments.transfer')}</th>
                <th className={tableHeadClass}>{t('dashboard.payments.submitted')}</th>
                <th className={tableHeadClass}>{t('dashboard.payments.status')}</th>
                <th className={tableHeadClass}>{t('dashboard.payments.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={tableCellClass}>
                    <div className="font-medium">{studentName(row)}</div>
                    <div className="text-xs text-text-muted">{row.user?.email}</div>
                    <div className="text-xs text-text-muted">
                      {row.kind === 'unable_to_pay'
                        ? t('dashboard.payments.kindUnable')
                        : t('dashboard.payments.kindVodafone')}
                    </div>
                  </td>
                  <td className={tableCellClass}>
                    {row.amount != null ? `${row.amount} ${row.currency}` : '—'}
                    <div className="text-xs text-text-muted">{row.planKey}</div>
                  </td>
                  <td className={tableCellClass}>{row.transferNumber || '—'}</td>
                  <td className={tableCellClass}>{formatWhen(row.submittedAt)}</td>
                  <td className={tableCellClass}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-2">
                      <Btn variant="info" onClick={() => setSelected(row)}>
                        {t('dashboard.payments.viewOrder')}
                      </Btn>
                      {row.status === 'pending' ? (
                        <>
                          <Btn variant="success" onClick={() => void approve(row.id)}>
                            {t('dashboard.payments.approve')}
                          </Btn>
                          <Btn
                            variant="danger"
                            onClick={() => {
                              setSelected(row);
                              setRejectNote('');
                              setRejectOpen(true);
                            }}
                          >
                            {t('dashboard.payments.reject')}
                          </Btn>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        {pagination.pages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              {t('dashboard.payments.pageLabel', {
                page: pagination.page,
                pages: pagination.pages,
              })}
            </p>
            <div className="flex gap-2">
              <Btn
                variant="secondary"
                disabled={!pagination.hasPrev || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('common.previous')}
              </Btn>
              <Btn
                variant="secondary"
                disabled={!pagination.hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.next')}
              </Btn>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">{t('dashboard.payments.settingsTitle')}</h2>
        <p className="mb-4 text-sm text-text-muted">{t('dashboard.payments.subtitle')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('dashboard.payments.vodafoneNumber')}>
            <Input
              value={settings.vodafoneCashNumber}
              onChange={(e) =>
                setSettings((s) => ({ ...s, vodafoneCashNumber: e.target.value }))
              }
            />
          </Field>
          <Field label={t('dashboard.payments.vodafoneName')}>
            <Input
              value={settings.vodafoneCashName}
              onChange={(e) =>
                setSettings((s) => ({ ...s, vodafoneCashName: e.target.value }))
              }
            />
          </Field>
          <Field label={t('dashboard.payments.instructionsAr')}>
            <TextArea
              rows={3}
              value={settings.instructionsAr}
              onChange={(e) =>
                setSettings((s) => ({ ...s, instructionsAr: e.target.value }))
              }
            />
          </Field>
          <Field label={t('dashboard.payments.instructionsEn')}>
            <TextArea
              rows={3}
              value={settings.instructionsEn}
              onChange={(e) =>
                setSettings((s) => ({ ...s, instructionsEn: e.target.value }))
              }
            />
          </Field>
        </div>
        <div className="mt-4">
          <Btn variant="success" onClick={() => void saveSettings()} disabled={loading}>
            {t('dashboard.payments.saveSettings')}
          </Btn>
        </div>
      </Card>

      <Modal
        open={Boolean(selected) && !rejectOpen}
        onClose={() => setSelected(null)}
        title={t('dashboard.payments.details')}
        wide
      >
        {selected ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-text-muted">{t('dashboard.payments.student')}: </span>
                {studentName(selected)}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.email')}: </span>
                {selected.user?.email || '—'}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.status')}: </span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(selected.status)}`}>
                  {statusLabel(selected.status)}
                </span>
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.plan')}: </span>
                {selected.planKey}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.amount')}: </span>
                {selected.amount != null ? `${selected.amount} ${selected.currency}` : '—'}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.periodDays')}: </span>
                {selected.periodDays}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.transfer')}: </span>
                {selected.transferNumber || '—'}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.submitted')}: </span>
                {formatWhen(selected.submittedAt)}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.reviewedAt')}: </span>
                {formatWhen(selected.reviewedAt)}
              </p>
              <p>
                <span className="text-text-muted">{t('dashboard.payments.activatedUntil')}: </span>
                {formatWhen(selected.activatedUntil)}
              </p>
              {selected.reviewNote ? (
                <p>
                  <span className="text-text-muted">{t('dashboard.payments.rejectNote')}: </span>
                  {selected.reviewNote}
                </p>
              ) : null}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t('dashboard.payments.receiptPreview')}</p>
              {selectedReceipt ? (
                <a href={selectedReceipt} target="_blank" rel="noreferrer">
                  <img
                    src={selectedReceipt}
                    alt={t('dashboard.payments.receipt')}
                    className="max-h-80 w-full rounded-lg border object-contain dark:border-gray-700"
                  />
                </a>
              ) : (
                <p className="text-sm text-text-muted">{t('dashboard.payments.noReceipt')}</p>
              )}
            </div>
            {selected.status === 'pending' ? (
              <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                <Btn
                  variant="danger"
                  onClick={() => {
                    setRejectNote('');
                    setRejectOpen(true);
                  }}
                >
                  {t('dashboard.payments.reject')}
                </Btn>
                <Btn variant="success" onClick={() => void approve(selected.id)}>
                  {t('dashboard.payments.approve')}
                </Btn>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t('dashboard.payments.reject')}
      >
        <p className="mb-3 text-sm text-text-muted">{t('dashboard.payments.confirmReject')}</p>
        <Field label={t('dashboard.payments.rejectNote')}>
          <TextArea
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Btn>
          <Btn variant="danger" onClick={() => void reject()} disabled={loading}>
            {t('dashboard.payments.reject')}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
