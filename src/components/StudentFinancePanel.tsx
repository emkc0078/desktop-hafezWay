import { useCallback, useEffect, useMemo, useState } from 'react';
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
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';

type PaymentStatus = 'pending' | 'approved' | 'rejected';
type HoursSource = 'attendance' | 'scheduled' | 'plan' | 'individual' | 'none';
type StatusFilter = 'all' | PaymentStatus | 'none';

type PaymentDto = {
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
};

type AttendanceWeek = {
  weekIndex: number;
  dateDisplay: string | null;
  attendance: number | null;
  present: boolean;
};

type StudentFinanceRow = {
  studentId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  planKey: string | null;
  planLabelEn: string | null;
  planLabelAr: string | null;
  planHours: number | null;
  planPrice: number | null;
  planCurrency: string;
  subscriptionPaidAt: string | null;
  subscriptionEndsAt: string | null;
  accessActive: boolean;
  paidAmount: number | null;
  currency: string;
  paymentStatus: PaymentStatus | null;
  receiptImage: string | null;
  primaryPayment: PaymentDto | null;
  payments: PaymentDto[];
  room: {
    id: string;
    nameAr: string;
    nameEn: string;
    daysOfWeek: string[];
    timeFrom: string | null;
    timeTo: string | null;
    sessionHours: number;
    scheduledSessions: number;
    scheduledHours: number;
  } | null;
  attendance: {
    presentWeeks: number;
    totalWeeks: number;
    attendedSessions: number;
    attendedHours: number;
    weeks: AttendanceWeek[];
    teacherNotes: string;
    hasReport: boolean;
  };
  hours: number;
  hoursSource: HoursSource;
  individualHours?: number;
  quotaHours?: number | null;
  memorizationMode?: string | null;
  scheduledHours: number;
  attendedHours: number;
};

type Totals = {
  students: number;
  withPayments: number;
  pending: number;
  approved: number;
  rejected: number;
  accessActive: number;
  hours: number;
  attendedHours: number;
  paidAmount: number;
};

type SummaryResponse = {
  data?: {
    year: number;
    month: number;
    hoursHint?: string;
    students?: StudentFinanceRow[];
    totals?: Totals;
  };
};

function resolveUploadUrl(serverUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const value = path.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  const base = serverUrl.replace(/\/$/, '');
  if (value.startsWith('/')) return `${base}${value}`;
  return value.startsWith('uploads/') ? `${base}/${value}` : `${base}/uploads/${value}`;
}

function formatMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function looksLikeCryptoJsCipher(value: string): boolean {
  const v = value.trim();
  return /^=?U2FsdGVk/i.test(v);
}

function contactSubtitle(row: { phone?: string | null; email?: string | null }): string {
  const phone = (row.phone ?? '').trim();
  if (phone && !looksLikeCryptoJsCipher(phone)) return phone;
  const email = (row.email ?? '').trim();
  return email || '—';
}

function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function statusBadgeClass(status: PaymentStatus | null): string {
  if (status === 'approved') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  }
  if (status === 'rejected') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  }
  if (status === 'pending') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
}

export function StudentFinancePanel({ active = true }: { active?: boolean }) {
  const t = useT();
  const { logsApiBase, serverUrl, adminToken } = useAdminSettings();
  const initial = useMemo(() => currentPeriod(), []);
  const [year, setYear] = useState(String(initial.year));
  const [month, setMonth] = useState(String(initial.month));
  const [rows, setRows] = useState<StudentFinanceRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [detailRow, setDetailRow] = useState<StudentFinanceRow | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!adminToken || !active) return;
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({ year, month });
      const res = await adminFetchJson<SummaryResponse>(
        `${logsApiBase}/student-finance/admin/summary?${qs.toString()}`,
        adminToken,
      );
      setRows(res.data?.students ?? []);
      setTotals(res.data?.totals ?? null);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, active, logsApiBase, month, t, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'none' && row.paymentStatus != null) return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'none' &&
        row.paymentStatus !== statusFilter
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        row.name,
        row.email,
        row.phone,
        row.planKey,
        row.planLabelEn,
        row.planLabelAr,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  const planLabel = (row: StudentFinanceRow): string => {
    const ar = (row.planLabelAr ?? '').trim();
    const en = (row.planLabelEn ?? '').trim();
    return ar || en || row.planKey || '—';
  };

  const paymentStatusLabel = (row: StudentFinanceRow): string => {
    if (row.primaryPayment?.kind === 'unable_to_pay') {
      return t('dashboard.studentFinance.status.hardship');
    }
    if (row.paymentStatus === 'approved') return t('dashboard.studentFinance.status.paid');
    if (row.paymentStatus === 'pending') return t('dashboard.studentFinance.status.pending');
    if (row.paymentStatus === 'rejected') return t('dashboard.studentFinance.status.rejected');
    if (row.planKey === 'free') return t('dashboard.studentFinance.status.free');
    return t('dashboard.studentFinance.status.unpaid');
  };

  const paymentDtoStatusLabel = (payment: PaymentDto): string => {
    if (payment.kind === 'unable_to_pay') return t('dashboard.studentFinance.status.hardship');
    if (payment.status === 'approved') return t('dashboard.studentFinance.status.paid');
    if (payment.status === 'pending') return t('dashboard.studentFinance.status.pending');
    if (payment.status === 'rejected') return t('dashboard.studentFinance.status.rejected');
    return t('dashboard.studentFinance.status.unpaid');
  };

  const hoursSourceLabel = (source: HoursSource): string =>
    t(`dashboard.studentFinance.hoursSource.${source}`);

  const receiptUrl = resolveUploadUrl(serverUrl, receiptPath);

  return (
    <div className={active ? 'space-y-6' : 'hidden'}>
      <div>
        <h2 className="text-xl font-semibold text-text-primary">
          {t('dashboard.studentFinance.title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('dashboard.studentFinance.subtitle')}</p>
        <p className="mt-2 text-xs text-text-muted">{t('dashboard.studentFinance.hoursHint')}</p>
      </div>

      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('dashboard.studentFinance.year')}>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min={2000}
              max={2100}
            />
          </Field>
          <Field label={t('dashboard.studentFinance.month')}>
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {t(`dashboard.studentFinance.months.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('dashboard.studentFinance.statusFilter')}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">{t('dashboard.studentFinance.statusAll')}</option>
              <option value="pending">{t('dashboard.studentFinance.status.pending')}</option>
              <option value="approved">{t('dashboard.studentFinance.status.paid')}</option>
              <option value="rejected">{t('dashboard.studentFinance.status.rejected')}</option>
              <option value="none">{t('dashboard.studentFinance.status.unpaid')}</option>
            </Select>
          </Field>
          <Field label={t('dashboard.studentFinance.search')}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dashboard.studentFinance.searchPlaceholder')}
            />
          </Field>
        </div>

        {totals ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.studentFinance.totalStudents')}</div>
              <div className="font-semibold">{totals.students}</div>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.studentFinance.totalHours')}</div>
              <div className="font-semibold">{totals.hours}</div>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.studentFinance.totalAttendance')}</div>
              <div className="font-semibold">{totals.attendedHours}</div>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.studentFinance.totalPaid')}</div>
              <div className="font-semibold">{formatMoney(totals.paidAmount, 'EGP')}</div>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-text-muted">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-text-muted">{t('dashboard.studentFinance.noStudents')}</p>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.student')}</th>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.package')}</th>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.paid')}</th>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.hours')}</th>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.attendance')}</th>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.statusLabel')}</th>
                  <th className={tableHeadClass}>{t('dashboard.studentFinance.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.studentId}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/40"
                    onClick={() => setDetailRow(row)}
                  >
                    <td className={tableCellClass}>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-text-muted">{contactSubtitle(row)}</div>
                    </td>
                    <td className={tableCellClass}>
                      <div>{planLabel(row)}</div>
                      {row.planHours != null ? (
                        <div className="text-xs text-text-muted">
                          {row.planHours} {t('dashboard.studentFinance.hoursUnit')}
                        </div>
                      ) : null}
                    </td>
                    <td className={tableCellClass}>
                      {formatMoney(row.paidAmount, row.currency)}
                    </td>
                    <td className={tableCellClass}>
                      <div>
                        {row.hoursSource === 'individual' &&
                        row.quotaHours != null
                          ? `${row.hours} / ${row.quotaHours}`
                          : row.hours}{' '}
                        {t('dashboard.studentFinance.hoursUnit')}
                      </div>
                      <div className="text-xs text-text-muted">
                        {hoursSourceLabel(row.hoursSource)}
                      </div>
                    </td>
                    <td className={tableCellClass}>
                      {row.attendance.presentWeeks}/{row.attendance.totalWeeks}
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.paymentStatus)}`}
                      >
                        {paymentStatusLabel(row)}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex flex-wrap gap-2">
                        {row.receiptImage ? (
                          <Btn
                            type="button"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReceiptPath(row.receiptImage);
                            }}
                          >
                            {t('dashboard.studentFinance.viewReceipt')}
                          </Btn>
                        ) : null}
                        <Btn
                          type="button"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailRow(row);
                          }}
                        >
                          {t('dashboard.studentFinance.viewDetails')}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </Card>

      <Modal
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={t('dashboard.studentFinance.detailsTitle')}
        wide
      >
        {detailRow ? (
          <div className="space-y-4 text-sm">
            <p className="text-text-muted">
              {t('dashboard.studentFinance.detailsSummary', {
                month: t(`dashboard.studentFinance.months.${month}`),
                year,
                package: planLabel(detailRow),
                paid: formatMoney(detailRow.paidAmount, detailRow.currency),
                hours: String(detailRow.hours),
                attendance: `${detailRow.attendance.presentWeeks}/${detailRow.attendance.totalWeeks}`,
              })}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-text-muted">{t('dashboard.studentFinance.package')}</div>
                <div className="font-medium">{planLabel(detailRow)}</div>
              </div>
              <div>
                <div className="text-text-muted">{t('dashboard.studentFinance.paid')}</div>
                <div className="font-medium">
                  {formatMoney(detailRow.paidAmount, detailRow.currency)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">{t('dashboard.studentFinance.subscription')}</div>
                <div className="font-medium">{formatWhen(detailRow.subscriptionEndsAt)}</div>
              </div>
              <div>
                <div className="text-text-muted">{t('dashboard.studentFinance.statusLabel')}</div>
                <div className="font-medium">
                  {detailRow.accessActive
                    ? t('dashboard.studentFinance.accessActive')
                    : t('dashboard.studentFinance.accessInactive')}
                </div>
              </div>
              <div>
                <div className="text-text-muted">{t('dashboard.studentFinance.hours')}</div>
                <div className="font-medium">
                  {detailRow.hours} ({hoursSourceLabel(detailRow.hoursSource)})
                </div>
              </div>
              {detailRow.hoursSource === 'individual' ? (
                <div>
                  <div className="text-text-muted">
                    {t('dashboard.studentFinance.quotaHours')}
                  </div>
                  <div className="font-medium">
                    {detailRow.quotaHours != null ? detailRow.quotaHours : '—'}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="text-text-muted">{t('dashboard.studentFinance.room')}</div>
                <div className="font-medium">
                  {detailRow.room
                    ? detailRow.room.nameAr || detailRow.room.nameEn || detailRow.room.id
                    : t('dashboard.studentFinance.noRoom')}
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-medium">{t('dashboard.studentFinance.attendance')}</h3>
              {detailRow.attendance.hasReport ? (
                <TableShell>
                  <thead>
                    <tr>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.week')}</th>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.date')}</th>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.present')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRow.attendance.weeks.map((week) => (
                      <tr key={week.weekIndex}>
                        <td className={tableCellClass}>{week.weekIndex}</td>
                        <td className={tableCellClass}>{week.dateDisplay || '—'}</td>
                        <td className={tableCellClass}>
                          {week.present
                            ? t('dashboard.studentFinance.presentYes')
                            : t('dashboard.studentFinance.presentNo')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              ) : (
                <p className="text-text-muted">{t('dashboard.studentFinance.noReport')}</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-medium">{t('dashboard.studentFinance.payments')}</h3>
              {detailRow.payments.length === 0 ? (
                <p className="text-text-muted">{t('dashboard.studentFinance.noPayments')}</p>
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.package')}</th>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.paid')}</th>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.statusLabel')}</th>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.submittedAt')}</th>
                      <th className={tableHeadClass}>{t('dashboard.studentFinance.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRow.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className={tableCellClass}>{payment.planKey}</td>
                        <td className={tableCellClass}>
                          {formatMoney(payment.amount, payment.currency)}
                        </td>
                        <td className={tableCellClass}>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(payment.status)}`}
                          >
                            {paymentDtoStatusLabel(payment)}
                          </span>
                        </td>
                        <td className={tableCellClass}>{formatWhen(payment.submittedAt)}</td>
                        <td className={tableCellClass}>
                          {payment.receiptImage ? (
                            <Btn
                              type="button"
                              variant="secondary"
                              onClick={() => setReceiptPath(payment.receiptImage)}
                            >
                              {t('dashboard.studentFinance.viewReceipt')}
                            </Btn>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(receiptPath)}
        onClose={() => setReceiptPath(null)}
        title={t('dashboard.studentFinance.receiptTitle')}
      >
        {receiptUrl ? (
          <a href={receiptUrl} target="_blank" rel="noreferrer">
            <img
              src={receiptUrl}
              alt={t('dashboard.studentFinance.receipt')}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          </a>
        ) : (
          <p className="text-sm text-text-muted">{t('dashboard.studentFinance.noImage')}</p>
        )}
      </Modal>
    </div>
  );
}
