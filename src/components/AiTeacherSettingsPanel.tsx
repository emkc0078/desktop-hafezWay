import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { ROOM_SCHEDULE_DAY_VALUES, type RoomScheduleDay } from '@/constants/roomEnums';
import { Btn, Card, Field, MessageBanner, Select } from '@/components/ui';

type Schedule = {
  daysOfWeek: RoomScheduleDay[];
  dayOfWeek: RoomScheduleDay;
  timeFrom: string;
  timeTo: string;
};

type Settings = {
  enabled: boolean;
  schedule: Schedule | null;
};

type SettingsResponse = {
  data?: { settings?: Settings };
};

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})();

function timeOptions(current: string, minExclusive?: string) {
  const set = new Set(TIME_SLOTS);
  if (current && /^\d{2}:\d{2}$/.test(current)) set.add(current);
  let values = [...set].sort();
  if (minExclusive) values = values.filter((t) => t > minExclusive);
  return values;
}

function emptySchedule(): Schedule {
  return {
    daysOfWeek: ['sunday'],
    dayOfWeek: 'sunday',
    timeFrom: '16:00',
    timeTo: '20:00',
  };
}

function normalizeSettings(raw?: Partial<Settings> | null): Settings {
  const enabled = raw?.enabled !== false;
  const scheduleRaw = raw?.schedule;
  if (
    !scheduleRaw ||
    !scheduleRaw.timeFrom ||
    !scheduleRaw.timeTo
  ) {
    return { enabled, schedule: null };
  }
  const days = Array.isArray(scheduleRaw.daysOfWeek)
    ? scheduleRaw.daysOfWeek.filter((d): d is RoomScheduleDay =>
        (ROOM_SCHEDULE_DAY_VALUES as readonly string[]).includes(d),
      )
    : [];
  const single =
    typeof scheduleRaw.dayOfWeek === 'string' &&
    (ROOM_SCHEDULE_DAY_VALUES as readonly string[]).includes(scheduleRaw.dayOfWeek)
      ? (scheduleRaw.dayOfWeek as RoomScheduleDay)
      : null;
  const daysOfWeek: RoomScheduleDay[] = days.length
    ? [...new Set(days)]
    : single
      ? [single]
      : ['sunday'];
  return {
    enabled,
    schedule: {
      daysOfWeek,
      dayOfWeek: daysOfWeek[0] ?? 'sunday',
      timeFrom: scheduleRaw.timeFrom,
      timeTo: scheduleRaw.timeTo,
    },
  };
}

export function AiTeacherSettingsPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [settings, setSettings] = useState<Settings>({
    enabled: true,
    schedule: null,
  });
  const [useSchedule, setUseSchedule] = useState(false);
  const [draftSchedule, setDraftSchedule] = useState<Schedule>(emptySchedule);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<SettingsResponse>(
        `${logsApiBase}/tutoring/admin/ai-teacher-settings`,
        adminToken,
      );
      const next = normalizeSettings(res.data?.settings);
      setSettings(next);
      setUseSchedule(Boolean(next.schedule));
      setDraftSchedule(next.schedule ?? emptySchedule());
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, logsApiBase, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayLabels = useMemo(
    () =>
      Object.fromEntries(
        ROOM_SCHEDULE_DAY_VALUES.map((d) => [
          d,
          t(`dashboard.rooms.scheduleDays.${d}`),
        ]),
      ) as Record<RoomScheduleDay, string>,
    [t],
  );

  const toggleDay = (day: RoomScheduleDay) => {
    setDraftSchedule((prev) => {
      const has = prev.daysOfWeek.includes(day);
      const daysOfWeek = has
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day];
      if (!daysOfWeek.length) return prev;
      return {
        ...prev,
        daysOfWeek,
        dayOfWeek: daysOfWeek[0],
      };
    });
  };

  const save = async () => {
    if (!adminToken) return;
    if (useSchedule) {
      if (!draftSchedule.daysOfWeek.length) {
        setMessage({ type: 'err', text: t('aiTeacherSettings.daysRequired') });
        return;
      }
      if (
        !draftSchedule.timeFrom ||
        !draftSchedule.timeTo ||
        draftSchedule.timeTo <= draftSchedule.timeFrom
      ) {
        setMessage({ type: 'err', text: t('aiTeacherSettings.invalidTime') });
        return;
      }
    }

    setLoading(true);
    setMessage(null);
    try {
      const body = {
        enabled: settings.enabled,
        schedule: useSchedule
          ? {
              daysOfWeek: draftSchedule.daysOfWeek,
              dayOfWeek: draftSchedule.daysOfWeek[0],
              timeFrom: draftSchedule.timeFrom,
              timeTo: draftSchedule.timeTo,
            }
          : null,
      };
      const res = await adminFetchJson<SettingsResponse>(
        `${logsApiBase}/tutoring/admin/ai-teacher-settings`,
        adminToken,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      );
      const next = normalizeSettings(res.data?.settings ?? body);
      setSettings(next);
      setUseSchedule(Boolean(next.schedule));
      setDraftSchedule(next.schedule ?? emptySchedule());
      setMessage({ type: 'ok', text: t('aiTeacherSettings.saved') });
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

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('aiTeacherSettings.title')}
        </h2>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">
          {t('aiTeacherSettings.subtitle')}
        </p>
      </div>

      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <input
          type="checkbox"
          className="mt-1 rounded"
          checked={settings.enabled}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, enabled: e.target.checked }))
          }
        />
        <span>
          <span className="block text-sm font-semibold text-text-primary dark:text-gray-100">
            {t('aiTeacherSettings.enabled')}
          </span>
          <span className="mt-1 block text-xs text-text-secondary dark:text-gray-300">
            {t('aiTeacherSettings.enabledHint')}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <input
          type="checkbox"
          className="mt-1 rounded"
          checked={useSchedule}
          disabled={!settings.enabled}
          onChange={(e) => {
            const next = e.target.checked;
            setUseSchedule(next);
            if (next && !draftSchedule.daysOfWeek.length) {
              setDraftSchedule(emptySchedule());
            }
          }}
        />
        <span>
          <span className="block text-sm font-semibold text-text-primary dark:text-gray-100">
            {t('aiTeacherSettings.useSchedule')}
          </span>
          <span className="mt-1 block text-xs text-text-secondary dark:text-gray-300">
            {t('aiTeacherSettings.useScheduleHint')}
          </span>
        </span>
      </label>

      {useSchedule && settings.enabled ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
          <Field label={t('dashboard.rooms.scheduleDaysLabel')}>
            <div className="flex flex-wrap gap-2">
              {ROOM_SCHEDULE_DAY_VALUES.map((d) => {
                const checked = draftSchedule.daysOfWeek.includes(d);
                return (
                  <label
                    key={d}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                      checked
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-gray-300 bg-white text-text-secondary dark:border-gray-600 dark:bg-gray-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={checked}
                      onChange={() => toggleDay(d)}
                    />
                    {dayLabels[d]}
                  </label>
                );
              })}
            </div>
          </Field>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('dashboard.rooms.scheduleFrom')}>
              <Select
                value={draftSchedule.timeFrom}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  setDraftSchedule((prev) => ({
                    ...prev,
                    timeFrom: nextFrom,
                    timeTo:
                      prev.timeTo && nextFrom && prev.timeTo <= nextFrom
                        ? ''
                        : prev.timeTo,
                  }));
                }}
              >
                <option value="">{t('dashboard.rooms.scheduleSelectTime')}</option>
                {timeOptions(draftSchedule.timeFrom).map((value) => (
                  <option key={`from-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('dashboard.rooms.scheduleTo')}>
              <Select
                value={draftSchedule.timeTo}
                onChange={(e) =>
                  setDraftSchedule((prev) => ({
                    ...prev,
                    timeTo: e.target.value,
                  }))
                }
              >
                <option value="">{t('dashboard.rooms.scheduleSelectTime')}</option>
                {timeOptions(draftSchedule.timeTo, draftSchedule.timeFrom).map(
                  (value) => (
                    <option key={`to-${value}`} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Btn onClick={() => void save()} disabled={loading}>
          {loading ? t('common.loading') : t('aiTeacherSettings.save')}
        </Btn>
        <Btn variant="secondary" onClick={() => void load()} disabled={loading}>
          {t('common.refresh')}
        </Btn>
      </div>
    </Card>
  );
}
