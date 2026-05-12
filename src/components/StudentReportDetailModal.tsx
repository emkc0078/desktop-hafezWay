import { useCallback, useEffect, useMemo, useState } from 'react';
import { Btn, Field, Modal, Select, TableShell } from '@/components/ui';
import { adminFetchJson } from '@/utils/adminFetch';
import { escapeHtml } from '@/utils/escapeHtml';

/** Matches front-hafezway `profile/reports.tsx` accent blocks */
const MINT_BG = '#d1fae5';

export type SessionStudentReportRow = {
  id: string;
  reportText?: unknown;
  createdAt?: unknown;
  teacher?: { id?: string; firstName?: string; lastName?: string } | null;
  student?: { id?: string; firstName?: string; lastName?: string; email?: string } | null;
  room?: { id?: string; nameEn?: string; nameAr?: string } | null;
};

type MonthlyWeekRow = {
  weekIndex: number;
  dateDisplay?: string | null;
  attendance?: number | null;
  preservation?: number | null;
  tajweed?: number | null;
};

type MonthlyPayload = {
  studentId?: string;
  year: number;
  month: number;
  rows?: MonthlyWeekRow[];
  teacherNotes?: string;
};

function displayName(u?: { firstName?: string; lastName?: string } | null): string {
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || '—';
}

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

export function StudentReportDetailModal(props: {
  open: boolean;
  onClose: () => void;
  sessionRow: SessionStudentReportRow | null;
  serverUrl: string;
  adminToken: string;
}) {
  const { open, onClose, sessionRow, serverUrl, adminToken } = props;

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);

  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPayload | null>(null);

  const studentId = sessionRow?.student?.id?.trim() ?? '';

  const monthLong = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month - 1, 1));
  }, [year, month]);

  const loadMonthly = useCallback(async () => {
    if (!open || !adminToken || !studentId) {
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
      const err = e as Error;
      setMonthlyError(err.message);
      setMonthly(null);
    } finally {
      setMonthlyLoading(false);
    }
  }, [open, adminToken, serverUrl, studentId, year, month]);

  useEffect(() => {
    void loadMonthly();
  }, [loadMonthly]);

  const rowMap = useMemo(() => mergeMonthlyRows(monthly?.rows), [monthly?.rows]);

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
  }, [now]);

  if (!sessionRow) return null;

  const roomTitle = sessionRow.room?.nameEn || sessionRow.room?.nameAr || '—';
  const sessionDate = sessionRow.createdAt
    ? new Date(String(sessionRow.createdAt)).toLocaleString()
    : '';

  return (
    <Modal open={open && !!sessionRow} onClose={onClose} title="Student report" maxWidthClass="max-w-5xl">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <section>
          <h4 className="mb-3 text-center text-xl font-bold text-neutral-900 dark:text-gray-100">
            Live session report
          </h4>
          <div className="rounded-[20px] p-4" style={{ backgroundColor: MINT_BG }}>
            <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-600 dark:bg-gray-900">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-text-muted">Student</span>
                  <p className="text-neutral-900 dark:text-gray-100">
                    {escapeHtml(displayName(sessionRow.student))}
                  </p>
                  {sessionRow.student?.email ? (
                    <p className="text-xs text-text-muted">{escapeHtml(String(sessionRow.student.email))}</p>
                  ) : null}
                </div>
                <div>
                  <span className="font-semibold text-text-muted">Teacher</span>
                  <p className="text-neutral-900 dark:text-gray-100">
                    {escapeHtml(displayName(sessionRow.teacher))}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-text-muted">Room</span>
                  <p className="text-neutral-900 dark:text-gray-100">{escapeHtml(String(roomTitle))}</p>
                </div>
                <div>
                  <span className="font-semibold text-text-muted">Submitted</span>
                  <p className="text-neutral-900 dark:text-gray-100">{sessionDate || '—'}</p>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3 dark:border-gray-600">
                <span className="font-semibold text-text-muted">Report</span>
                <p className="mt-2 whitespace-pre-wrap text-neutral-800 dark:text-gray-200">
                  {escapeHtml(String(sessionRow.reportText ?? '')) || '—'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-center text-xl font-bold text-neutral-900 dark:text-gray-100">
            Monthly student report
          </h4>
          <p className="mb-4 text-center text-lg font-bold text-neutral-900 dark:text-gray-100">
            Report for {monthLong}
          </p>

          {!studentId ? (
            <p className="text-center text-sm text-amber-700 dark:text-amber-300">
              No student id on this row — monthly sheet unavailable.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <Field label="Year" className="w-28">
                  <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Month" className="min-w-[12rem]">
                  <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2000, m - 1, 1))}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Btn variant="info" type="button" onClick={() => void loadMonthly()} disabled={monthlyLoading}>
                  {monthlyLoading ? 'Loading…' : 'Reload'}
                </Btn>
              </div>

              {monthlyError ? (
                <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
                  {monthlyError}
                </p>
              ) : null}

              {monthlyLoading && !monthly ? (
                <p className="text-text-muted">Loading monthly report…</p>
              ) : (
                <>
                  <div className="rounded-[20px] p-4" style={{ backgroundColor: MINT_BG }}>
                    <TableShell className="rounded-[14px] border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-950">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted">
                            Week
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted">Day</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-muted">
                            Attendance
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-muted">
                            Preservation
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-muted">
                            Tajweed
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
                                Week {w}
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
                    <p className="mb-2 text-lg font-bold text-neutral-900 dark:text-gray-100">Teacher notes</p>
                    <div className="min-h-[120px] rounded-[14px] border border-gray-200 bg-white p-3 text-[15px] leading-relaxed text-neutral-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                      {monthly?.teacherNotes?.trim()
                        ? escapeHtml(monthly.teacherNotes)
                        : '—'}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
