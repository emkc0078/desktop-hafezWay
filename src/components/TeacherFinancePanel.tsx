import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson, adminFetchResponse } from '@/utils/adminFetch';
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

type FinanceSettings = {
  hourlyRate: number;
  currency: string;
};

type Settlement = {
  id: string;
  teacherId: string;
  year: number;
  month: number;
  roomsCount: number;
  sessionsCount: number;
  hours: number;
  hourlyRate: number;
  amount: number;
  currency: string;
  transferImage: string;
  note?: string;
  settledAt: string;
};

type RoomDetail = {
  id: string;
  nameAr: string;
  nameEn: string;
  daysOfWeek?: string[];
  timeFrom?: string | null;
  timeTo?: string | null;
  sessionHours?: number;
  sessionsCount?: number;
  hours?: number;
};

type TeacherFinanceRow = {
  teacherId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  roomsCount: number;
  sessionsCount: number;
  hours: number;
  hourlyRate: number;
  /** True when teacher has a personal rate (not only the global default). */
  isCustomRate?: boolean;
  amount: number;
  currency: string;
  status: 'open' | 'settled';
  settlement: Settlement | null;
  rooms: RoomDetail[];
};

type Totals = {
  teachers: number;
  open: number;
  settled: number;
  roomsCount: number;
  sessionsCount: number;
  hours: number;
  amount: number;
};

type SummaryResponse = {
  data?: {
    year: number;
    month: number;
    settings?: FinanceSettings;
    teachers?: TeacherFinanceRow[];
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

function formatMoney(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

/** CryptoJS AES ciphertext often looks like `U2FsdGVkX1…` (sometimes with a leading `=`). */
function looksLikeCryptoJsCipher(value: string): boolean {
  const v = value.trim();
  return /^=?U2FsdGVk/i.test(v);
}

function teacherContactSubtitle(row: {
  phone?: string | null;
  email?: string | null;
}): string {
  const phone = (row.phone ?? '').trim();
  if (phone && !looksLikeCryptoJsCipher(phone)) return phone;
  const email = (row.email ?? '').trim();
  return email || '—';
}

function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function TeacherFinancePanel({ active = true }: { active?: boolean }) {
  const t = useT();
  const { logsApiBase, serverUrl, adminToken } = useAdminSettings();
  const initial = useMemo(() => currentPeriod(), []);
  const [year, setYear] = useState(String(initial.year));
  const [month, setMonth] = useState(String(initial.month));
  const [rows, setRows] = useState<TeacherFinanceRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [settings, setSettings] = useState<FinanceSettings>({
    hourlyRate: 0,
    currency: 'EGP',
  });
  const [rateInput, setRateInput] = useState('0');
  const [currencyInput, setCurrencyInput] = useState('EGP');
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingRateId, setSavingRateId] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'settled'>('all');
  const [search, setSearch] = useState('');

  const [settleRow, setSettleRow] = useState<TeacherFinanceRow | null>(null);
  const [settleHours, setSettleHours] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferPreview, setTransferPreview] = useState('');
  const [settling, setSettling] = useState(false);

  const [viewSettlement, setViewSettlement] = useState<Settlement | null>(null);
  const [detailRow, setDetailRow] = useState<TeacherFinanceRow | null>(null);

  const load = useCallback(async () => {
    if (!adminToken || !active) return;
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({ year, month });
      const res = await adminFetchJson<SummaryResponse>(
        `${logsApiBase}/teacher-finance/admin/summary?${qs.toString()}`,
        adminToken,
      );
      const list = res.data?.teachers ?? [];
      setRows(list);
      setRateDrafts(
        Object.fromEntries(
          list.map((row) => [row.teacherId, String(row.hourlyRate ?? 0)]),
        ),
      );
      setTotals(res.data?.totals ?? null);
      const s = res.data?.settings;
      if (s) {
        setSettings(s);
        setRateInput(String(s.hourlyRate ?? 0));
        setCurrencyInput(s.currency || 'EGP');
      }
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

  useEffect(() => {
    return () => {
      if (transferPreview.startsWith('blob:')) URL.revokeObjectURL(transferPreview);
    };
  }, [transferPreview]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      const phone = (row.phone ?? '').trim();
      const phoneSearchable =
        phone && !looksLikeCryptoJsCipher(phone) ? phone.toLowerCase() : '';
      return (
        row.name.toLowerCase().includes(q) ||
        (row.email ?? '').toLowerCase().includes(q) ||
        (phoneSearchable ? phoneSearchable.includes(q) : false)
      );
    });
  }, [rows, search, statusFilter]);

  const saveSettings = async () => {
    if (!adminToken) return;
    const hourlyRate = Number(rateInput);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      setMessage({ type: 'err', text: t('dashboard.teacherFinance.invalidRate') });
      return;
    }
    setSavingSettings(true);
    setMessage(null);
    try {
      await adminFetchJson(`${logsApiBase}/teacher-finance/admin/settings`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({
          hourlyRate,
          currency: currencyInput.trim() || 'EGP',
        }),
      });
      setMessage({ type: 'ok', text: t('dashboard.teacherFinance.settingsSaved') });
      await load();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const saveTeacherRate = async (row: TeacherFinanceRow) => {
    if (!adminToken) return;
    const draft = rateDrafts[row.teacherId] ?? String(row.hourlyRate);
    const hourlyRate = Number(draft);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      setMessage({ type: 'err', text: t('dashboard.teacherFinance.invalidRate') });
      return;
    }
    setSavingRateId(row.teacherId);
    setMessage(null);
    try {
      await adminFetchJson(
        `${logsApiBase}/teacher-finance/admin/${row.teacherId}/rate`,
        adminToken,
        {
          method: 'PUT',
          body: JSON.stringify({ hourlyRate }),
        },
      );
      const amount = Math.round(row.hours * hourlyRate * 100) / 100;
      setRows((prev) =>
        prev.map((r) =>
          r.teacherId === row.teacherId
            ? { ...r, hourlyRate, isCustomRate: true, amount }
            : r,
        ),
      );
      setRateDrafts((prev) => ({ ...prev, [row.teacherId]: String(hourlyRate) }));
      setTotals((prev) => {
        if (!prev) return prev;
        const delta = amount - row.amount;
        return { ...prev, amount: Math.round((prev.amount + delta) * 100) / 100 };
      });
      if (detailRow?.teacherId === row.teacherId) {
        setDetailRow((prev) =>
          prev ? { ...prev, hourlyRate, isCustomRate: true, amount } : prev,
        );
      }
      if (settleRow?.teacherId === row.teacherId) {
        setSettleRow((prev) =>
          prev ? { ...prev, hourlyRate, isCustomRate: true, amount } : prev,
        );
        setSettleAmount(String(amount));
      }
      setMessage({ type: 'ok', text: t('dashboard.teacherFinance.rateSaved') });
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setSavingRateId(null);
    }
  };

  const openSettle = (row: TeacherFinanceRow) => {
    setSettleRow(row);
    setSettleHours(String(row.hours));
    setSettleAmount(String(row.amount));
    setSettleNote('');
    setTransferFile(null);
    if (transferPreview.startsWith('blob:')) URL.revokeObjectURL(transferPreview);
    setTransferPreview('');
  };

  const closeSettle = () => {
    setSettleRow(null);
    setTransferFile(null);
    if (transferPreview.startsWith('blob:')) URL.revokeObjectURL(transferPreview);
    setTransferPreview('');
  };

  const submitSettle = async () => {
    if (!adminToken || !settleRow) return;
    if (!transferFile) {
      setMessage({ type: 'err', text: t('dashboard.teacherFinance.transferRequired') });
      return;
    }
    setSettling(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append('year', year);
      body.append('month', month);
      body.append('hours', settleHours);
      body.append('amount', settleAmount);
      if (settleNote.trim()) body.append('note', settleNote.trim());
      body.append('transferImage', transferFile);

      const res = await adminFetchResponse(
        `${logsApiBase}/teacher-finance/admin/${settleRow.teacherId}/settle`,
        adminToken,
        { method: 'POST', body },
      );
      if (!res.ok) {
        let msg = t('common.error');
        try {
          const err = (await res.json()) as { message?: string };
          if (err.message) msg = err.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setMessage({ type: 'ok', text: t('dashboard.teacherFinance.settledOk') });
      closeSettle();
      await load();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setSettling(false);
    }
  };

  const years = useMemo(() => {
    const y = initial.year;
    return [y - 1, y, y + 1];
  }, [initial.year]);

  return (
    <div className={active ? 'space-y-4' : 'hidden'}>
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('dashboard.teacherFinance.title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('dashboard.teacherFinance.subtitle')}</p>
      </div>

      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
        />
      ) : null}

      <Card>
        <p className="mb-3 text-sm font-medium text-text-secondary">
          {t('dashboard.teacherFinance.settingsTitle')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('dashboard.teacherFinance.hourlyRate')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
          </Field>
          <Field label={t('dashboard.teacherFinance.currency')}>
            <Input
              value={currencyInput}
              onChange={(e) => setCurrencyInput(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Btn
              variant="primary"
              type="button"
              disabled={savingSettings}
              onClick={() => void saveSettings()}
            >
                {savingSettings
                ? t('common.working')
                : t('dashboard.teacherFinance.saveSettings')}
            </Btn>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label={t('dashboard.teacherFinance.year')}>
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('dashboard.teacherFinance.month')}>
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {t(`dashboard.teacherFinance.months.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('dashboard.teacherFinance.statusFilter')}>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'open' | 'settled')
              }
            >
              <option value="all">{t('dashboard.teacherFinance.statusAll')}</option>
              <option value="open">{t('dashboard.teacherFinance.statusOpen')}</option>
              <option value="settled">
                {t('dashboard.teacherFinance.statusSettled')}
              </option>
            </Select>
          </Field>
          <Field label={t('dashboard.teacherFinance.search')}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dashboard.teacherFinance.searchPlaceholder')}
            />
          </Field>
          <Btn variant="secondary" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? t('common.loading') : t('common.refresh')}
          </Btn>
        </div>

        {totals ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.teacherFinance.totalRooms')}</div>
              <div className="font-semibold">{totals.roomsCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.teacherFinance.totalSessions')}</div>
              <div className="font-semibold">{totals.sessionsCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.teacherFinance.totalHours')}</div>
              <div className="font-semibold">{totals.hours}</div>
            </div>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <div className="text-text-muted">{t('dashboard.teacherFinance.totalAmount')}</div>
              <div className="font-semibold">
                {formatMoney(totals.amount, settings.currency)}
              </div>
            </div>
          </div>
        ) : null}

        {loading && !rows.length ? (
          <p className="text-sm text-text-muted">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-muted">{t('dashboard.teacherFinance.noTeachers')}</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.teacher')}</th>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.rooms')}</th>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.sessions')}</th>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.hours')}</th>
                <th className={tableHeadClass}>
                  {t('dashboard.teacherFinance.teacherHourlyRate')}
                </th>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.account')}</th>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.status')}</th>
                <th className={tableHeadClass}>{t('dashboard.teacherFinance.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.teacherId}
                  className="cursor-pointer border-t border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                  onClick={() => setDetailRow(row)}
                >
                  <td className={tableCellClass}>
                    <div className="font-medium text-brand-primary underline-offset-2 hover:underline">
                      {row.name}
                    </div>
                    <div className="text-xs text-text-muted">
                      {teacherContactSubtitle(row)}
                    </div>
                  </td>
                  <td className={tableCellClass}>{row.roomsCount}</td>
                  <td className={tableCellClass}>{row.sessionsCount}</td>
                  <td className={tableCellClass}>{row.hours}</td>
                  <td className={tableCellClass} onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-w-[10.5rem] flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <div className="w-24 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={rateDrafts[row.teacherId] ?? String(row.hourlyRate)}
                            onChange={(e) =>
                              setRateDrafts((prev) => ({
                                ...prev,
                                [row.teacherId]: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <Btn
                          variant="secondary"
                          type="button"
                          disabled={savingRateId === row.teacherId}
                          onClick={() => void saveTeacherRate(row)}
                        >
                          {savingRateId === row.teacherId
                            ? t('common.working')
                            : t('dashboard.teacherFinance.saveRate')}
                        </Btn>
                      </div>
                      {!row.isCustomRate ? (
                        <span className="text-[11px] text-text-muted">
                          {t('dashboard.teacherFinance.usingDefaultRate')}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={tableCellClass}>
                    {formatMoney(
                      row.settlement?.amount ?? row.amount,
                      row.settlement?.currency ?? row.currency,
                    )}
                  </td>
                  <td className={tableCellClass}>
                    <span
                      className={
                        row.status === 'settled'
                          ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                      }
                    >
                      {row.status === 'settled'
                        ? t('dashboard.teacherFinance.statusSettled')
                        : t('dashboard.teacherFinance.statusOpen')}
                    </span>
                  </td>
                  <td className={tableCellClass} onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      {row.status === 'open' ? (
                        <Btn
                          variant="primary"
                          type="button"
                          onClick={() => openSettle(row)}
                        >
                          {t('dashboard.teacherFinance.settle')}
                        </Btn>
                      ) : row.settlement ? (
                        <Btn
                          variant="secondary"
                          type="button"
                          onClick={() => setViewSettlement(row.settlement)}
                        >
                          {t('dashboard.teacherFinance.viewTransfer')}
                        </Btn>
                      ) : null}
                      <Btn
                        variant="secondary"
                        type="button"
                        onClick={() => setDetailRow(row)}
                      >
                        {t('dashboard.teacherFinance.viewDetails')}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={t('dashboard.teacherFinance.detailsTitle')}
        wide
      >
        {detailRow ? (
          <div className="space-y-4">
            <div>
              <p className="text-base font-semibold text-text-primary">{detailRow.name}</p>
              <p className="text-sm text-text-muted">
                {t('dashboard.teacherFinance.detailsSummary', {
                  month: t(`dashboard.teacherFinance.months.${month}`),
                  year,
                  rooms: String(detailRow.roomsCount),
                  sessions: String(detailRow.sessionsCount),
                  hours: String(detailRow.hours),
                  amount: formatMoney(
                    detailRow.settlement?.amount ?? detailRow.amount,
                    detailRow.settlement?.currency ?? detailRow.currency,
                  ),
                })}
              </p>
            </div>
            {!detailRow.rooms.length ? (
              <p className="text-sm text-text-muted">
                {t('dashboard.teacherFinance.noRooms')}
              </p>
            ) : (
              <TableShell>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>
                      {t('dashboard.teacherFinance.roomName')}
                    </th>
                    <th className={tableHeadClass}>
                      {t('dashboard.teacherFinance.scheduleDays')}
                    </th>
                    <th className={tableHeadClass}>
                      {t('dashboard.teacherFinance.scheduleTime')}
                    </th>
                    <th className={tableHeadClass}>
                      {t('dashboard.teacherFinance.sessionHours')}
                    </th>
                    <th className={tableHeadClass}>
                      {t('dashboard.teacherFinance.sessions')}
                    </th>
                    <th className={tableHeadClass}>
                      {t('dashboard.teacherFinance.hours')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detailRow.rooms.map((room) => {
                    const days = (room.daysOfWeek ?? [])
                      .map((d) => {
                        const key = `dashboard.rooms.scheduleDays.${d}`;
                        const label = t(key);
                        return label === key ? d : label;
                      })
                      .join('، ');
                    const time =
                      room.timeFrom && room.timeTo
                        ? `${room.timeFrom} – ${room.timeTo}`
                        : '—';
                    const roomLabel =
                      room.nameAr || room.nameEn || room.id;
                    return (
                      <tr
                        key={room.id}
                        className="border-t border-gray-100 dark:border-gray-800"
                      >
                        <td className={tableCellClass}>
                          <div className="font-medium">{roomLabel}</div>
                          {room.nameEn && room.nameAr && room.nameEn !== room.nameAr ? (
                            <div className="text-xs text-text-muted">{room.nameEn}</div>
                          ) : null}
                        </td>
                        <td className={tableCellClass}>{days || '—'}</td>
                        <td className={tableCellClass}>{time}</td>
                        <td className={tableCellClass}>
                          {room.sessionHours ?? '—'}
                        </td>
                        <td className={tableCellClass}>
                          {room.sessionsCount ?? '—'}
                        </td>
                        <td className={tableCellClass}>{room.hours ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            )}
            <div className="flex justify-end">
              <Btn variant="secondary" type="button" onClick={() => setDetailRow(null)}>
                {t('common.cancel')}
              </Btn>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(settleRow)}
        onClose={closeSettle}
        title={t('dashboard.teacherFinance.settleTitle')}
      >
        {settleRow ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {t('dashboard.teacherFinance.settleHint', {
                name: settleRow.name,
                month: t(`dashboard.teacherFinance.months.${month}`),
                year,
              })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('dashboard.teacherFinance.hours')}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={settleHours}
                  onChange={(e) => {
                    const nextHours = e.target.value;
                    setSettleHours(nextHours);
                    const h = Number(nextHours);
                    if (Number.isFinite(h) && settleRow) {
                      setSettleAmount(
                        String(Math.round(h * settleRow.hourlyRate * 100) / 100),
                      );
                    }
                  }}
                />
              </Field>
              <Field label={t('dashboard.teacherFinance.teacherHourlyRate')}>
                <Input type="number" value={String(settleRow.hourlyRate)} disabled />
              </Field>
              <Field label={t('dashboard.teacherFinance.account')}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t('dashboard.teacherFinance.transferImage')}>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setTransferFile(file);
                  if (transferPreview.startsWith('blob:')) {
                    URL.revokeObjectURL(transferPreview);
                  }
                  setTransferPreview(file ? URL.createObjectURL(file) : '');
                }}
              />
              {transferPreview ? (
                <img
                  src={transferPreview}
                  alt=""
                  className="mt-2 max-h-48 rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                />
              ) : null}
            </Field>
            <Field label={t('dashboard.teacherFinance.note')}>
              <TextArea
                rows={2}
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Btn variant="secondary" type="button" onClick={closeSettle}>
                {t('common.cancel')}
              </Btn>
              <Btn
                variant="primary"
                type="button"
                disabled={settling}
                onClick={() => void submitSettle()}
              >
                {settling
                  ? t('common.working')
                  : t('dashboard.teacherFinance.confirmSettle')}
              </Btn>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(viewSettlement)}
        onClose={() => setViewSettlement(null)}
        title={t('dashboard.teacherFinance.transferTitle')}
      >
        {viewSettlement ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              {formatMoney(viewSettlement.amount, viewSettlement.currency)} ·{' '}
              {viewSettlement.hours} {t('dashboard.teacherFinance.hoursUnit')} ·{' '}
              {new Date(viewSettlement.settledAt).toLocaleString()}
            </p>
            {viewSettlement.note ? (
              <p className="text-sm text-text-muted">{viewSettlement.note}</p>
            ) : null}
            {resolveUploadUrl(serverUrl, viewSettlement.transferImage) ? (
              <a
                href={resolveUploadUrl(serverUrl, viewSettlement.transferImage) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={resolveUploadUrl(serverUrl, viewSettlement.transferImage) ?? undefined}
                  alt=""
                  className="max-h-96 w-full rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                />
              </a>
            ) : (
              <p className="text-sm text-text-muted">{t('dashboard.teacherFinance.noImage')}</p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
