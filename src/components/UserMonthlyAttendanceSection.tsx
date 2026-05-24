import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/context/LocaleContext';
import { Btn, Field, Select, TableShell, tableHeadClass } from '@/components/ui';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { escapeHtml } from '@/utils/escapeHtml';

const MINT_BG = '#d1fae5';

type MonthlyWeekRow = {
  weekIndex: number;
  dateDisplay?: string | null;
  attendance?: number | null;
  preservation?: number | null;
  tajweed?: number | null;
  learnedInSession?: string;
};

type MonthlyPayload = {
  year: number;
  month: number;
  rows?: MonthlyWeekRow[];
  teacherNotes?: string;
};

function mergeMonthlyRows(rows: MonthlyWeekRow[] | undefined): Record<number, MonthlyWeekRow> {
  const out: Record<number, MonthlyWeekRow> = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const w = Number(r.weekIndex);
    if (w >= 1 && w <= 4) out[w] = r;
  }
  return out;
}

function attendanceSymbol(attendance: number | null | undefined): string {
  if (attendance === null || attendance === undefined) return '—';
  return Number(attendance) >= 1 ? '✓' : '—';
}

function scoreSymbol(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Math.round(Number(v));
  return n >= 1 && n <= 5 ? String(n) : '—';
}

type Props = {
  studentId: string;
  serverUrl: string;
  adminToken: string;
};

export function UserMonthlyAttendanceSection({ studentId, serverUrl, adminToken }: Props) {
  const t = useT();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPayload | null>(null);

  const monthLong = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month - 1, 1)),
    [year, month],
  );

  const loadMonthly = useCallback(async () => {
    if (!adminToken || !studentId) {
      setMonthly(null);
      return;
    }
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      const base = serverUrl.replace(/\/$/, '');
      const url = `${base}/api/students/${encodeURIComponent(studentId)}/monthly-report?year=${year}&month=${month}`;
      const res = await adminFetchJson<{ data: MonthlyPayload }>(url, adminToken);
      setMonthly(res.data);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMonthlyError((e as Error).message);
      setMonthly(null);
    } finally {
      setMonthlyLoading(false);
    }
  }, [adminToken, serverUrl, studentId, year, month]);

  useEffect(() => {
    void loadMonthly();
  }, [loadMonthly]);

  const rowMap = useMemo(() => mergeMonthlyRows(monthly?.rows), [monthly?.rows]);

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
  }, [now]);

  return (
    <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className="mb-1 font-semibold text-text-secondary">{t('dashboard.users.attendanceSection')}</p>
      <p className="mb-4 text-xs text-text-muted">{t('dashboard.users.attendanceHint')}</p>
      <p className="mb-3 text-sm font-medium text-neutral-900 dark:text-gray-100">
        {t('studentReport.reportFor', { month: monthLong })}
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('studentReport.year')} className="w-28">
          <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('studentReport.month')} className="min-w-[12rem]">
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2000, m - 1, 1))}
              </option>
            ))}
          </Select>
        </Field>
        <Btn variant="info" type="button" onClick={() => void loadMonthly()} disabled={monthlyLoading}>
          {monthlyLoading ? t('common.loading') : t('studentReport.reload')}
        </Btn>
      </div>

      {monthlyError ? (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {monthlyError}
        </p>
      ) : null}

      {monthlyLoading && !monthly ? (
        <p className="text-text-muted">{t('studentReport.loadingMonthly')}</p>
      ) : (
        <>
          <div className="rounded-[20px] p-4" style={{ backgroundColor: MINT_BG }}>
            <TableShell className="rounded-[14px] border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-950">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className={tableHeadClass}>{t('studentReport.week')}</th>
                  <th className={tableHeadClass}>{t('studentReport.day')}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-muted">
                    {t('studentReport.attendance')}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-muted">
                    {t('studentReport.preservation')}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-muted">
                    {t('studentReport.tajweed')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {([1, 2, 3, 4] as const).map((w) => {
                  const r = rowMap[w] ?? { weekIndex: w };
                  const dayLabel =
                    r.dateDisplay != null && String(r.dateDisplay).trim()
                      ? String(r.dateDisplay)
                      : '—';
                  return (
                    <tr key={w}>
                      <td className="px-3 py-3 text-[13px] font-semibold text-neutral-900 dark:text-gray-100">
                        {t('studentReport.weekN', { n: w })}
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-neutral-900 dark:text-gray-100">
                        {dayLabel}
                      </td>
                      <td className="px-3 py-3 text-center text-lg text-neutral-900 dark:text-gray-100">
                        {attendanceSymbol(r.attendance)}
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-neutral-900 dark:text-gray-100">
                        {scoreSymbol(r.preservation)}
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-neutral-900 dark:text-gray-100">
                        {scoreSymbol(r.tajweed)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-gray-100">
              {t('studentReport.teacherNotes')}
            </p>
            <div className="min-h-[80px] rounded-[14px] border border-gray-200 bg-white p-3 text-sm leading-relaxed text-neutral-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
              {monthly?.teacherNotes?.trim() ? escapeHtml(monthly.teacherNotes) : '—'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
