import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { AdminAuthBar } from '@/components/AdminAuthBar';
import { adminFetchJson } from '@/utils/adminFetch';
import { reportAdminApiError } from '@/utils/adminSession';
import { escapeHtml } from '@/utils/escapeHtml';
import { buildLivekitRoomViewUrl } from '@/utils/livekitRoomUrl';
import {
  StudentReportDetailModal,
  type SessionStudentReportRow,
} from '@/components/StudentReportDetailModal';
import { RoomParticipantsCell, formatRoomOccupancy, roomParticipantsFromRecord } from '@/components/RoomParticipantsCell';
import { SignupOffersPanel } from '@/components/SignupOffersPanel';
import { SignupPlansPanel } from '@/components/SignupPlansPanel';
import { SiteAgreementPanel } from '@/components/SiteAgreementPanel';
import { UserMonthlyAttendanceSection } from '@/components/UserMonthlyAttendanceSection';
import { UserTeacherRatingsSection } from '@/components/UserTeacherRatingsSection';
import { useAppVersion } from '@/hooks/useAppVersion';
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
  TextArea,
} from '@/components/ui';
import {
  RoomListStatus,
  RoomScheduleDay,
  ROOM_SCHEDULE_DAY_VALUES,
} from '@/constants/roomEnums';
import {
  SIGNUP_PROGRAM_SKIPS_AMOUNT_WEEKLY_SURAH,
  SIGNUP_QUIZ_AMOUNT,
  SIGNUP_QUIZ_MEMORIZED,
  SIGNUP_QUIZ_PLAN,
  SIGNUP_QUIZ_PROGRAM,
  SIGNUP_QUIZ_SURAH,
  SIGNUP_QUIZ_WEEKLY,
  SignupUserType,
} from '@/constants/signupQuizOptions';
import {
  TEACHER_DEGREE_OPTIONS,
  TEACHER_LANGUAGE_OPTIONS,
  TEACHER_NARRATION_OPTIONS,
  TEACHER_QIRAAT_OPTIONS,
  TEACHER_SCIENCE_OPTIONS,
} from '@/constants/signupTeacherOptions';

type Tab =
  | 'rooms'
  | 'users'
  | 'comments'
  | 'studentReports'
  | 'roomRatings'
  | 'notifications'
  | 'signupPlans'
  | 'offers'
  | 'siteAgreement';

const AUTH_PROVIDER_GOOGLE = 'google';
const AUTH_PROVIDER_TWITTER = 'twitter';

function resolveUserSignInKind(provider: unknown): 'google' | 'twitter' | 'facebook' | 'email' {
  const normalized = String(provider ?? '').toLowerCase();
  if (normalized === AUTH_PROVIDER_GOOGLE) return 'google';
  if (normalized === AUTH_PROVIDER_TWITTER || normalized === 'x') return 'twitter';
  if (normalized === 'facebook') return 'facebook';
  return 'email';
}

const SIGN_IN_BADGE_CLASS: Record<ReturnType<typeof resolveUserSignInKind>, string> = {
  google: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  twitter: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
  facebook: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  email: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
};

function UserSignInBadge({
  provider,
  t,
}: {
  provider: unknown;
  t: (key: string) => string;
}) {
  const kind = resolveUserSignInKind(provider);
  const labelKey =
    kind === 'google'
      ? 'dashboard.users.signInGoogle'
      : kind === 'twitter'
        ? 'dashboard.users.signInX'
        : kind === 'facebook'
          ? 'dashboard.users.signInFacebook'
          : 'dashboard.users.signInEmail';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-sm font-medium ${SIGN_IN_BADGE_CLASS[kind]}`}
    >
      {t(labelKey)}
    </span>
  );
}

function UserProfileBadge({
  incomplete,
  t,
}: {
  incomplete: boolean;
  t: (key: string) => string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-sm font-medium ${
        incomplete
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
      }`}
    >
      {incomplete ? t('dashboard.users.profileIncomplete') : t('dashboard.users.profileComplete')}
    </span>
  );
}

type Pagination = {
  page: number;
  pages: number;
  total: number;
  hasPrev?: boolean;
  hasNext?: boolean;
};

type NotifUserRow = {
  userId: string;
  user?: { firstName?: string; lastName?: string; email?: string };
  platforms?: string[];
  tokenCount?: number;
  lastUsed?: string;
};

/** User row shape from `/getUsers` (recipient picker). */
type NotifyPickerUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};

/** Editable signup questionnaire fields (`PATCH /signup-options/:userId`). */
type AdminSignupDraft = {
  userType: '' | SignupUserType;
  languageTag: string;
  preferredLanguage: string;
  nationality: string;
  countryResidence: string;
  motherTongue: string;
  dateOfBirth: string;
  memorizedQuran: string;
  amount: string;
  program: string;
  weekly: string;
  surah: string;
  signupPlan: string;
  otherLanguages: string;
  academicDegree: string;
  primaryIjazat: string;
  approvedRiwayat: string[];
  proficientQiraat: string[];
  ijazatObtained: string[];
  teachingSciences: string[];
  authorizedBooks: string;
};

function stringArrayFromUnknown(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter((v) => v.trim() !== '');
}

function signupDraftFromUserDetail(detail: Record<string, unknown>): AdminSignupDraft {
  const nestedVal = detail.signupProfile;
  const nested =
    nestedVal && typeof nestedVal === 'object' && nestedVal !== null
      ? (nestedVal as Record<string, unknown>)
      : {};
  const get = (key: string) => {
    const v = nested[key] !== undefined ? nested[key] : detail[key];
    if (v === undefined || v === null) return '';
    return String(v);
  };
  const getArr = (key: string) => {
    const v = nested[key] !== undefined ? nested[key] : detail[key];
    return stringArrayFromUnknown(v);
  };
  let userType: AdminSignupDraft['userType'] = '';
  const utRaw = nested.userType !== undefined ? nested.userType : detail.userType;
  if (
    utRaw === SignupUserType.MALE ||
    utRaw === SignupUserType.FEMALE ||
    utRaw === SignupUserType.CHILDREN
  ) {
    userType = utRaw;
  }
  let dobStr = '';
  const dobSrc = nested.dateOfBirth !== undefined ? nested.dateOfBirth : detail.dateOfBirth;
  if (dobSrc instanceof Date && !Number.isNaN(dobSrc.getTime())) {
    dobStr = dobSrc.toISOString().slice(0, 10);
  } else if (typeof dobSrc === 'string') {
    const m = dobSrc.match(/^(\d{4}-\d{2}-\d{2})/);
    dobStr = m ? m[1] : '';
  }

  return {
    userType,
    languageTag: get('languageTag'),
    preferredLanguage: get('preferredLanguage'),
    nationality: get('nationality'),
    countryResidence: get('countryResidence'),
    motherTongue: get('motherTongue'),
    dateOfBirth: dobStr,
    memorizedQuran: get('memorizedQuran'),
    amount: get('amount'),
    program: get('program'),
    weekly: get('weekly'),
    surah: get('surah'),
    signupPlan: get('signupPlan'),
    otherLanguages: get('otherLanguages'),
    academicDegree: get('academicDegree'),
    primaryIjazat: get('primaryIjazat'),
    approvedRiwayat: getArr('approvedRiwayat'),
    proficientQiraat: getArr('proficientQiraat'),
    ijazatObtained: getArr('ijazatObtained'),
    teachingSciences: getArr('teachingSciences'),
    authorizedBooks: get('authorizedBooks'),
  };
}

/** Label for stored quiz key; falls back to raw value if unknown. */
function signupQuizOptionLabel(val: string, t: (key: string) => string): string {
  if (!val) return '';
  const path = `dashboard.users.signupQuizVals.${val}`;
  const lbl = t(path);
  return lbl === path ? val : lbl;
}

/** Label for teacher signup enum key. */
function signupTeacherOptionLabel(val: string, t: (key: string) => string): string {
  if (!val) return '';
  const path = `dashboard.users.signupTeacherVals.${val}`;
  const lbl = t(path);
  return lbl === path ? val : lbl;
}

function teacherSelectOptions(
  allowed: readonly string[],
  current: string,
  t: (key: string) => string,
): { value: string; label: string }[] {
  const unset = t('dashboard.users.signupUserTypeUnset');
  const customNote = t('dashboard.users.signupCustomStored');
  const opts: { value: string; label: string }[] = [{ value: '', label: unset }];
  if (current && !allowed.includes(current)) {
    const pretty = signupTeacherOptionLabel(current, t);
    opts.push({
      value: current,
      label: pretty === current ? `${current} (${customNote})` : pretty,
    });
  }
  for (const v of allowed) {
    opts.push({ value: v, label: signupTeacherOptionLabel(v, t) });
  }
  return opts;
}

function CheckboxMultiSelect({
  options,
  values,
  onChange,
}: {
  options: { value: string; label: string }[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
      {options.map((o) => {
        const checked = values.includes(o.value);
        return (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2 text-sm text-text-primary"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checked}
              onChange={() => {
                onChange(
                  checked ? values.filter((v) => v !== o.value) : [...values, o.value],
                );
              }}
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function UserDetailReadonlyRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const display = value != null && String(value).trim() !== '' ? String(value) : '—';
  return (
    <div>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-primary">{display}</p>
    </div>
  );
}

function formatJoinedLabels(
  values: string[],
  labelFor: (v: string) => string,
): string {
  if (!values.length) return '';
  return values.map((v) => labelFor(v)).join(', ');
}

/** Names when recipients are listed and ≤10; otherwise count / “all”. */
function formatNotificationHistoryRecipients(
  row: Record<string, unknown>,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const total = Number(row.totalRecipients ?? 0);
  const recipientType = String(row.recipientType ?? '');
  const raw = row.recipientIds;
  const names: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const u = item as Record<string, unknown>;
        const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
        if (name) {
          names.push(name);
          continue;
        }
        if (typeof u.email === 'string' && u.email.trim() !== '') {
          names.push(u.email.trim());
          continue;
        }
        const id = u._id ?? u.id;
        if (id != null) names.push(String(id).slice(-6));
      } else if (item != null && String(item).trim() !== '') {
        names.push(String(item).slice(-6));
      }
    }
  }

  const specified = recipientType === 'single' || recipientType === 'multiple';
  // Show names when listed recipients exist and count ≤ 10 (specified list, or small batch).
  if (names.length > 0 && names.length <= 10 && (specified || total <= 10 || names.length < 10)) {
    return names.join(', ');
  }

  if (recipientType === 'all') {
    return t('dashboard.notifications.recipientsAll', { count: total || '—' });
  }
  if (total > 0) return String(total);
  if (names.length > 0) return String(names.length);
  return '—';
}

/** `datetime-local` value from ISO string (local timezone). */
function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Editable subscription fields (`PATCH /subscription/:userId`). */
type AdminSubscriptionDraft = {
  signupPlan: string;
  subscriptionPaidAt: string;
  subscriptionEndsAt: string;
  assignedStudyRoomId: string;
};

function subscriptionDraftFromUserDetail(
  detail: Record<string, unknown>,
): AdminSubscriptionDraft {
  const sub = detail.subscription;
  const subObj =
    sub && typeof sub === 'object' && sub !== null ? (sub as Record<string, unknown>) : {};
  const planKey = typeof subObj.planKey === 'string' ? subObj.planKey : '';
  const paidAtIso = typeof subObj.paidAt === 'string' && subObj.paidAt.trim() !== '' ? subObj.paidAt : '';
  const endsAtIso =
    typeof subObj.endsAt === 'string' && subObj.endsAt.trim() !== '' ? subObj.endsAt : '';
  const ar = subObj.assignedRoom;
  let roomId = '';
  if (ar && typeof ar === 'object' && ar !== null && typeof (ar as { id?: string }).id === 'string') {
    roomId = (ar as { id: string }).id;
  }
  const signupNested = detail.signupProfile;
  const nestedPlan =
    signupNested && typeof signupNested === 'object' && signupNested !== null
      ? String((signupNested as { signupPlan?: string }).signupPlan ?? '')
      : '';
  return {
    signupPlan: planKey || nestedPlan,
    subscriptionPaidAt: paidAtIso ? isoToDatetimeLocalValue(paidAtIso) : '',
    subscriptionEndsAt: endsAtIso ? isoToDatetimeLocalValue(endsAtIso) : '',
    assignedStudyRoomId: roomId || '__none__',
  };
};

/** Options for `<Select>` matching front-end signup dropdowns (+ optional legacy/custom row). */
function signupQuizSelectOptions(
  allowed: readonly string[],
  current: string,
  t: (key: string) => string,
): { value: string; label: string }[] {
  const unset = t('dashboard.users.signupUserTypeUnset');
  const customNote = t('dashboard.users.signupCustomStored');
  const opts: { value: string; label: string }[] = [{ value: '', label: unset }];
  const allow = allowed as readonly string[];
  if (current && !allow.includes(current)) {
    const pretty = signupQuizOptionLabel(current, t);
    const suffix = ` (${customNote})`;
    opts.push({
      value: current,
      label: pretty !== current ? `${pretty}${suffix}` : `${current}${suffix}`,
    });
  }
  for (const v of allowed) {
    opts.push({ value: v, label: signupQuizOptionLabel(v, t) });
  }
  return opts;
}

const ROOM_TYPE_COUNTS = [2, 3, 5, 10] as const;

/** 30-minute slots `00:00` … `23:30` for schedule dropdowns. */
const ROOM_SCHEDULE_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})();

function scheduleTimeOptionsForSelect(
  current: string,
  minExclusive?: string,
): { value: string; label: string }[] {
  const set = new Set(ROOM_SCHEDULE_TIME_SLOTS);
  if (current && /^\d{2}:\d{2}$/.test(current)) {
    set.add(current);
  }
  let values = [...set].sort();
  if (minExclusive) {
    values = values.filter((t) => t > minExclusive);
  }
  return values.map((value) => ({ value, label: value }));
}

/** Normalize Mongo/API user or ObjectId refs to a string id. */
function entityId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim();
    return s === '[object Object]' ? '' : s;
  }
  if (typeof value === 'object') {
    const o = value as { id?: unknown; _id?: unknown; toString?: () => string };
    const fromId = entityId(o.id);
    if (fromId) return fromId;
    const fromUnderscore = entityId(o._id);
    if (fromUnderscore) return fromUnderscore;
    if (typeof o.toString === 'function' && o.toString !== Object.prototype.toString) {
      const s = o.toString().trim();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

type RoomNotifyMember = {
  id: string;
  name: string;
  email?: string;
  role: 'student' | 'teacher';
};

/** Students + reserved teacher for room push notifications. */
function roomMembersForNotify(room: Record<string, unknown>): RoomNotifyMember[] {
  const students = roomParticipantsFromRecord(room).map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: 'student' as const,
  }));
  const members: RoomNotifyMember[] = [...students];
  const teacher = room.reservedTeacher;
  const tid = entityId(teacher);
  if (tid && !members.some((m) => m.id === tid)) {
    let name = tid;
    let email: string | undefined;
    if (teacher && typeof teacher === 'object') {
      const o = teacher as Record<string, unknown>;
      const first = String(o.firstName ?? '').trim();
      const last = String(o.lastName ?? '').trim();
      const mail = typeof o.email === 'string' ? o.email.trim() : '';
      name = `${first} ${last}`.trim() || mail || tid;
      email = mail || undefined;
    }
    members.push({ id: tid, name, email, role: 'teacher' });
  }
  return members;
}

function roomDisplayName(room: Record<string, unknown>): string {
  const en = String(room.nameEn ?? '').trim();
  const ar = String(room.nameAr ?? '').trim();
  if (en && ar && en !== ar) return `${en} / ${ar}`;
  return en || ar || entityId(room._id) || entityId(room.id) || '—';
}

function scheduleFromRoomRecord(room: Record<string, unknown>): {
  scheduleDays: RoomScheduleDay[];
  scheduleTimeFrom: string;
  scheduleTimeTo: string;
} {
  const raw = room.schedule;
  if (!raw || typeof raw !== 'object') {
    return { scheduleDays: [], scheduleTimeFrom: '', scheduleTimeTo: '' };
  }
  const s = raw as Record<string, unknown>;
  const fromArray = Array.isArray(s.daysOfWeek)
    ? s.daysOfWeek
        .map((d) => (typeof d === 'string' ? d.toLowerCase() : ''))
        .filter((d): d is RoomScheduleDay =>
          (ROOM_SCHEDULE_DAY_VALUES as readonly string[]).includes(d),
        )
    : [];
  const single =
    typeof s.dayOfWeek === 'string' ? s.dayOfWeek.toLowerCase() : '';
  const fromSingle = (ROOM_SCHEDULE_DAY_VALUES as readonly string[]).includes(single)
    ? [single as RoomScheduleDay]
    : [];
  const scheduleDays = [...new Set(fromArray.length ? fromArray : fromSingle)];
  return {
    scheduleDays,
    scheduleTimeFrom: typeof s.timeFrom === 'string' ? s.timeFrom : '',
    scheduleTimeTo: typeof s.timeTo === 'string' ? s.timeTo : '',
  };
}

function formatRoomScheduleCell(
  room: Record<string, unknown>,
  t: (key: string) => string,
): string {
  const { scheduleDays, scheduleTimeFrom, scheduleTimeTo } = scheduleFromRoomRecord(room);
  if (!scheduleDays.length || !scheduleTimeFrom || !scheduleTimeTo) return '—';
  const dayLabels = scheduleDays.map((d) => t(`dashboard.rooms.scheduleDays.${d}`));
  return `${dayLabels.join(', ')} ${scheduleTimeFrom}–${scheduleTimeTo}`;
}

export function AdminDashboardPage() {
  const t = useT();
  const appVersion = useAppVersion();
  const { serverUrl, liveAppUrl, adminToken, adminName, adminUserId } = useAdminSettings();

  const [tab, setTab] = useState<Tab>('rooms');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );

  const showMessage = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setMessage({ text, type });
    window.setTimeout(
      () => setMessage(null),
      type === 'success' ? 3000 : 5000,
    );
  }, []);

  const openLiveKitRoomView = useCallback(
    async (room: Record<string, unknown>) => {
      if (!adminToken) {
        showMessage(t('common.signInFirst'), 'error');
        return;
      }
      const roomId = String(room._id ?? '');
      const title = String(room.nameEn ?? room.nameAr ?? '');
      try {
        const res = await adminFetchJson<{ token?: string }>(
          `${serverUrl.replace(/\/$/, '')}/api/livekit/token`,
          adminToken,
          {
            method: 'POST',
            body: JSON.stringify({
              roomName: roomId,
              ...(adminName.trim() ? { userName: adminName.trim() } : {}),
            }),
          },
        );
        const lk = res.token;
        if (!lk) throw new Error('No LiveKit token in API response');
        const url = buildLivekitRoomViewUrl(liveAppUrl, roomId, title, {
          lkToken: lk,
          userRole: 'admin',
        });
        window.open(url, '_blank');
      } catch (e) {
        showMessage(t('dashboard.rooms.openRoomError', { message: (e as Error).message }), 'error');
      }
    },
    [adminToken, adminName, serverUrl, liveAppUrl, showMessage, t],
  );

  const [roomSearch, setRoomSearch] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<RoomListStatus>(RoomListStatus.ALL);
  const [userSearch, setUserSearch] = useState('');
  const [userRole, setUserRole] = useState('');
  const [commentSearch, setCommentSearch] = useState('');
  const [studentReportSearch, setStudentReportSearch] = useState('');
  const [roomRatingSearch, setRoomRatingSearch] = useState('');
  const [pages, setPages] = useState({
    rooms: 1,
    users: 1,
    comments: 1,
    studentReports: 1,
    roomRatings: 1,
  });

  const [roomsState, setRoomsState] = useState<{ loading: boolean; error?: string; data?: unknown }>({
    loading: false,
  });
  const [usersState, setUsersState] = useState<{ loading: boolean; error?: string; data?: unknown }>({
    loading: false,
  });
  const [commentsState, setCommentsState] = useState<{ loading: boolean; error?: string; data?: unknown }>({
    loading: false,
  });
  const [studentReportsState, setStudentReportsState] = useState<{
    loading: boolean;
    error?: string;
    data?: unknown;
  }>({ loading: false });
  const [roomRatingsState, setRoomRatingsState] = useState<{ loading: boolean; error?: string; data?: unknown }>({
    loading: false,
  });

  const loadRooms = useCallback(async () => {
    if (!adminToken) return;
    // Keep existing rows visible while refreshing so teacher selects don't reset to empty.
    setRoomsState((prev) => ({
      ...prev,
      loading: !prev.data,
      error: undefined,
    }));
    try {
      let url = `${serverUrl}/rooms?page=${pages.rooms}&limit=20&status=${roomStatusFilter}`;
      if (roomSearch) url += `&search=${encodeURIComponent(roomSearch)}`;
      if (roomTypeFilter) url += `&type=${roomTypeFilter}`;
      const data = await adminFetchJson<{ data?: unknown } | Record<string, unknown>>(url, adminToken);
      const roomsData = 'data' in data && data.data !== undefined ? data.data : data;
      setRoomsState({ loading: false, data: roomsData });
    } catch (e) {
      const err = e as Error;
      setRoomsState((prev) => ({ ...prev, loading: false, error: err.message }));
      showMessage(t('dashboard.rooms.loadError', { message: err.message }), 'error');
    }
  }, [adminToken, serverUrl, pages.rooms, roomSearch, roomTypeFilter, roomStatusFilter, showMessage, t]);

  const setRoomActive = useCallback(
    async (roomId: string, active: boolean) => {
      if (!adminToken) return;
      const path = active ? 'activate' : 'deactivate';
      const confirmKey = active
        ? 'dashboard.rooms.confirmActivate'
        : 'dashboard.rooms.confirmDeactivate';
      if (!confirm(t(confirmKey))) return;
      try {
        await adminFetchJson(`${serverUrl}/rooms/${roomId}/${path}`, adminToken, {
          method: 'PATCH',
        });
        setRoomsState((prev) => {
          const raw = prev.data as { rooms?: Record<string, unknown>[]; pagination?: unknown } | undefined;
          if (!raw?.rooms) return prev;
          return {
            ...prev,
            data: {
              ...raw,
              rooms: raw.rooms.map((r) =>
                String(r._id) === roomId ? { ...r, isActive: active } : r,
              ),
            },
          };
        });
        showMessage(
          active ? t('dashboard.rooms.activated') : t('dashboard.rooms.deactivated'),
          'success',
        );
        void loadRooms();
      } catch (e) {
        reportAdminApiError(e, (msg) => showMessage(msg, 'error'), t);
      }
    },
    [adminToken, serverUrl, showMessage, t, loadRooms],
  );

  const deleteRoom = useCallback(
    async (roomId: string) => {
      if (!adminToken) return;
      if (!confirm(t('dashboard.rooms.confirmDelete'))) return;
      try {
        await adminFetchJson(`${serverUrl}/rooms/${roomId}`, adminToken, {
          method: 'DELETE',
        });
        setRoomsState((prev) => {
          const raw = prev.data as { rooms?: Record<string, unknown>[]; pagination?: unknown } | undefined;
          if (!raw?.rooms) return prev;
          return {
            ...prev,
            data: {
              ...raw,
              rooms: raw.rooms.filter((r) => String(r._id) !== roomId),
            },
          };
        });
        showMessage(t('dashboard.rooms.deleted'), 'success');
        void loadRooms();
      } catch (e) {
        reportAdminApiError(e, (msg) => showMessage(msg, 'error'), t);
      }
    },
    [adminToken, serverUrl, showMessage, t, loadRooms],
  );

  const loadUsers = useCallback(async () => {
    if (!adminToken) return;
    setUsersState({ loading: true });
    try {
      let url = `${serverUrl}/getUsers?page=${pages.users}&limit=20`;
      if (userSearch) url += `&search=${encodeURIComponent(userSearch)}`;
      if (userRole) url += `&role=${userRole}`;
      const data = await adminFetchJson<{ data: unknown }>(url, adminToken);
      setUsersState({ loading: false, data: data.data });
    } catch (e) {
      const err = e as Error;
      setUsersState({ loading: false, error: err.message });
      showMessage(t('dashboard.users.loadError', { message: err.message }), 'error');
    }
  }, [adminToken, serverUrl, pages.users, userSearch, userRole, showMessage, t]);

  const loadComments = useCallback(async () => {
    if (!adminToken) return;
    setCommentsState({ loading: true });
    try {
      let url = `${serverUrl}/api/comments/getAll?page=${pages.comments}&limit=20`;
      if (commentSearch) url += `&search=${encodeURIComponent(commentSearch)}`;
      const data = await adminFetchJson<{ data: unknown }>(url, adminToken);
      setCommentsState({ loading: false, data: data.data });
    } catch (e) {
      const err = e as Error;
      setCommentsState({ loading: false, error: err.message });
      showMessage(t('dashboard.comments.loadError', { message: err.message }), 'error');
    }
  }, [adminToken, serverUrl, pages.comments, commentSearch, showMessage, t]);

  const loadStudentReports = useCallback(async () => {
    if (!adminToken) return;
    setStudentReportsState({ loading: true });
    try {
      let url = `${serverUrl}/rooms/admin/student-reports?page=${pages.studentReports}&limit=20`;
      if (studentReportSearch) url += `&search=${encodeURIComponent(studentReportSearch)}`;
      const data = await adminFetchJson<{ data: unknown }>(url, adminToken);
      setStudentReportsState({ loading: false, data: data.data });
    } catch (e) {
      const err = e as Error;
      setStudentReportsState({ loading: false, error: err.message });
      showMessage(t('dashboard.studentReports.loadError', { message: err.message }), 'error');
    }
  }, [adminToken, serverUrl, pages.studentReports, studentReportSearch, showMessage, t]);

  const loadRoomRatings = useCallback(async () => {
    if (!adminToken) return;
    setRoomRatingsState({ loading: true });
    try {
      let url = `${serverUrl}/rooms/admin/room-ratings?page=${pages.roomRatings}&limit=20`;
      if (roomRatingSearch) url += `&search=${encodeURIComponent(roomRatingSearch)}`;
      const data = await adminFetchJson<{ data: unknown }>(url, adminToken);
      setRoomRatingsState({ loading: false, data: data.data });
    } catch (e) {
      const err = e as Error;
      setRoomRatingsState({ loading: false, error: err.message });
      showMessage(t('dashboard.roomRatings.loadError', { message: err.message }), 'error');
    }
  }, [adminToken, serverUrl, pages.roomRatings, roomRatingSearch, showMessage, t]);

  useEffect(() => {
    if (!adminToken) return;
    if (tab === 'rooms') void loadRooms();
    else if (tab === 'users') void loadUsers();
    else if (tab === 'comments') void loadComments();
    else if (tab === 'studentReports') void loadStudentReports();
    else if (tab === 'roomRatings') void loadRoomRatings();
  }, [
    tab,
    adminToken,
    loadRooms,
    loadUsers,
    loadComments,
    loadStudentReports,
    loadRoomRatings,
  ]);

  const [selectedSessionReport, setSelectedSessionReport] = useState<SessionStudentReportRow | null>(null);

  const [roomModal, setRoomModal] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState({
    nameAr: '',
    nameEn: '',
    description: '',
    type: '',
    participants: '',
    reservedTeacherId: '__none__',
    scheduleDays: [] as RoomScheduleDay[],
    scheduleTimeFrom: '',
    scheduleTimeTo: '',
  });
  const [roomTeacherOptions, setRoomTeacherOptions] = useState<
    { id: string; label: string }[]
  >([]);

  const loadRoomTeacherOptions = useCallback(async () => {
    if (!adminToken) return;
    try {
      const data = await adminFetchJson<{ data?: { users?: Record<string, unknown>[] } }>(
        `${serverUrl}/getUsers?page=1&limit=200&role=teacher`,
        adminToken,
      );
      const users = data.data?.users ?? [];
      setRoomTeacherOptions(
        users
          .filter((u) => {
            const role = String(u.role ?? '').toLowerCase();
            if (role && role !== 'teacher') return false;
            return u.active !== false;
          })
          .map((u) => {
            // `/getUsers` returns `id`; some payloads still use `_id`.
            const id = String(u.id ?? u._id ?? '').trim();
            const first = String(u.firstName ?? '').trim();
            const last = String(u.lastName ?? '').trim();
            const email = String(u.email ?? '').trim();
            const name = `${first} ${last}`.trim();
            return { id, label: name || email || id };
          })
          .filter((o) => o.id)
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
      );
    } catch {
      setRoomTeacherOptions([]);
    }
  }, [adminToken, serverUrl]);

  useEffect(() => {
    if (!adminToken || tab !== 'rooms') return;
    void loadRoomTeacherOptions();
  }, [adminToken, tab, loadRoomTeacherOptions]);

  const reservedTeacherIdFromRoom = (room: Record<string, unknown>): string => {
    const id = entityId(room.reservedTeacher);
    return id || '__none__';
  };

  const patchRoomReservedTeacherLocal = useCallback(
    (roomId: string, reservedTeacher: unknown) => {
      setRoomsState((prev) => {
        const raw = prev.data as
          | { rooms?: Record<string, unknown>[]; pagination?: unknown }
          | undefined;
        if (!raw?.rooms) return prev;
        return {
          ...prev,
          data: {
            ...raw,
            rooms: raw.rooms.map((r) =>
              entityId(r._id) === roomId || entityId(r.id) === roomId
                ? { ...r, reservedTeacher }
                : r,
            ),
          },
        };
      });
    },
    [],
  );

  const assignRoomTeacher = useCallback(
    async (roomId: string, teacherId: string) => {
      if (!adminToken) return;
      const reservedTeacherId = teacherId === '__none__' ? null : teacherId || null;
      const teacherOpt = reservedTeacherId
        ? roomTeacherOptions.find((o) => o.id === reservedTeacherId)
        : undefined;
      const nameParts = (teacherOpt?.label ?? '').trim().split(/\s+/).filter(Boolean);
      const optimisticTeacher = reservedTeacherId
        ? {
            _id: reservedTeacherId,
            id: reservedTeacherId,
            firstName: nameParts[0] ?? '',
            lastName: nameParts.slice(1).join(' '),
            email: '',
          }
        : null;

      // Keep the select on the chosen teacher while the request runs.
      patchRoomReservedTeacherLocal(roomId, optimisticTeacher);

      try {
        const res = await adminFetchJson<{ data?: Record<string, unknown> }>(
          `${serverUrl}/rooms/${roomId}`,
          adminToken,
          {
            method: 'PATCH',
            body: JSON.stringify({ reservedTeacherId }),
          },
        );
        const fromServer = res.data?.reservedTeacher;
        patchRoomReservedTeacherLocal(
          roomId,
          fromServer !== undefined ? fromServer : optimisticTeacher,
        );
        showMessage(
          reservedTeacherId
            ? t('dashboard.rooms.teacherAssigned')
            : t('dashboard.rooms.teacherCleared'),
          'success',
        );
        void loadRooms();
      } catch (err) {
        void loadRooms();
        showMessage(
          t('dashboard.rooms.teacherAssignError', {
            message: (err as Error).message,
          }),
          'error',
        );
      }
    },
    [
      adminToken,
      serverUrl,
      showMessage,
      t,
      loadRooms,
      roomTeacherOptions,
      patchRoomReservedTeacherLocal,
    ],
  );

  const openCreateRoom = () => {
    setEditingRoomId(null);
    setRoomForm({
      nameAr: '',
      nameEn: '',
      description: '',
      type: '',
      participants: '',
      reservedTeacherId: '__none__',
      scheduleDays: [],
      scheduleTimeFrom: '09:00',
      scheduleTimeTo: '10:00',
    });
    setRoomModal(true);
    void loadRoomTeacherOptions();
  };

  const toggleScheduleDay = (day: RoomScheduleDay) => {
    setRoomForm((f) => {
      const has = f.scheduleDays.includes(day);
      return {
        ...f,
        scheduleDays: has
          ? f.scheduleDays.filter((d) => d !== day)
          : [...f.scheduleDays, day],
      };
    });
  };

  const editRoom = async (id: string) => {
    if (!adminToken) return;
    try {
      const data = await adminFetchJson<{ data: Record<string, unknown> }>(
        `${serverUrl}/rooms/${id}`,
        adminToken,
      );
      const room = data.data;
      setEditingRoomId(id);
      const reserved = room.reservedTeacher;
      const reservedTeacherId = entityId(reserved) || '__none__';
      setRoomForm({
        nameAr: String(room.nameAr ?? ''),
        nameEn: String(room.nameEn ?? ''),
        description: String(room.description ?? ''),
        type: String(room.type ?? ''),
        participants: '',
        reservedTeacherId,
        ...scheduleFromRoomRecord(room),
      });
      setRoomModal(true);
      void loadRoomTeacherOptions();
    } catch (e) {
      showMessage(t('dashboard.rooms.loadRoomError', { message: (e as Error).message }), 'error');
    }
  };

  const submitRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const nameAr = roomForm.nameAr.trim();
    const nameEn = roomForm.nameEn.trim();
    const description = roomForm.description.trim();
    const type = parseInt(roomForm.type, 10);
    const participantIds = roomForm.participants
      ? roomForm.participants
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (!nameAr || !nameEn || !type) {
      showMessage(t('dashboard.rooms.requiredFields'), 'error');
      return;
    }
    const scheduleDays = roomForm.scheduleDays;
    const scheduleTimeFrom = roomForm.scheduleTimeFrom.trim();
    const scheduleTimeTo = roomForm.scheduleTimeTo.trim();
    if (!scheduleDays.length || !scheduleTimeFrom || !scheduleTimeTo) {
      showMessage(t('dashboard.rooms.scheduleRequired'), 'error');
      return;
    }
    if (scheduleTimeFrom >= scheduleTimeTo) {
      showMessage(t('dashboard.rooms.scheduleTimeOrder'), 'error');
      return;
    }
    try {
      const reservedTeacherId =
        roomForm.reservedTeacherId === '__none__'
          ? null
          : roomForm.reservedTeacherId || null;
      const body = {
        nameAr,
        nameEn,
        description: description || undefined,
        type,
        participantIds: participantIds.length ? participantIds : undefined,
        reservedTeacherId,
        schedule: {
          daysOfWeek: scheduleDays,
          dayOfWeek: scheduleDays[0],
          timeFrom: scheduleTimeFrom,
          timeTo: scheduleTimeTo,
        },
      };
      if (editingRoomId) {
        await adminFetchJson(`${serverUrl}/rooms/${editingRoomId}`, adminToken, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        showMessage(t('dashboard.rooms.updated'), 'success');
      } else {
        await adminFetchJson(`${serverUrl}/rooms`, adminToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showMessage(t('dashboard.rooms.created'), 'success');
      }
      setRoomModal(false);
      void loadRooms();
    } catch (err) {
      reportAdminApiError(err, (msg) => showMessage(msg, 'error'), t);
    }
  };

  const [userModal, setUserModal] = useState<{ id: string } | null>(null);
  const [userDetail, setUserDetail] = useState<Record<string, unknown> | null>(null);
  const [userDetailTab, setUserDetailTab] = useState<'view' | 'edit'>('view');
  const [signupEdit, setSignupEdit] = useState<AdminSignupDraft | null>(null);
  const [signupSaving, setSignupSaving] = useState(false);
  const [subEdit, setSubEdit] = useState<AdminSubscriptionDraft | null>(null);
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [userModalRooms, setUserModalRooms] = useState<Record<string, unknown>[]>([]);
  const [commentModal, setCommentModal] = useState<{ id: string } | null>(null);
  const [commentDetail, setCommentDetail] = useState<Record<string, unknown> | null>(null);

  const openUser = async (userId: string) => {
    if (!adminToken) return;
    setUserModal({ id: userId });
    setUserDetail(null);
    setUserDetailTab('view');
    setUserModalRooms([]);
    try {
      const [detailData, roomsRes] = await Promise.all([
        adminFetchJson<{ data: { user: Record<string, unknown> } }>(
          `${serverUrl}/getById/${userId}`,
          adminToken,
        ),
        adminFetchJson<{ data?: { rooms?: unknown[] } } | { rooms?: unknown[] }>(
          `${serverUrl}/rooms?page=1&limit=300`,
          adminToken,
        ),
      ]);
      setUserDetail(detailData.data.user);
      const inner = 'data' in roomsRes && roomsRes.data !== undefined ? roomsRes.data : roomsRes;
      const list =
        inner && typeof inner === 'object' && inner !== null && 'rooms' in inner
          ? (inner as { rooms?: unknown[] }).rooms
          : undefined;
      setUserModalRooms(Array.isArray(list) ? (list as Record<string, unknown>[]) : []);
    } catch (e) {
      showMessage(t('dashboard.users.loadDetailError', { message: (e as Error).message }), 'error');
    }
  };

  useEffect(() => {
    if (!userDetail) {
      setSignupEdit(null);
      return;
    }
    setSignupEdit(signupDraftFromUserDetail(userDetail));
  }, [userDetail]);

  useEffect(() => {
    if (!userDetail) {
      setSubEdit(null);
      return;
    }
    setSubEdit(subscriptionDraftFromUserDetail(userDetail));
  }, [userDetail]);

  const saveSignupOptions = async () => {
    if (!adminToken || !userModal || !signupEdit || !userDetail) return;
    const trimOrNull = (s: string) => {
      const v = s.trim();
      return v === '' ? null : v;
    };
    const arrOrNull = (arr: string[]) => (arr.length === 0 ? null : arr);
    const dobRaw = signupEdit.dateOfBirth.trim();
    const isTeacher = String(userDetail.role ?? '') === 'teacher';
    const body: Record<string, unknown> = {
      userType: signupEdit.userType === '' ? null : signupEdit.userType,
      languageTag: trimOrNull(signupEdit.languageTag),
      preferredLanguage: trimOrNull(signupEdit.preferredLanguage),
      nationality: trimOrNull(signupEdit.nationality),
      countryResidence: trimOrNull(signupEdit.countryResidence),
      motherTongue: trimOrNull(signupEdit.motherTongue),
      dateOfBirth: dobRaw === '' ? null : dobRaw,
    };
    if (isTeacher) {
      body.otherLanguages = trimOrNull(signupEdit.otherLanguages);
      body.academicDegree = trimOrNull(signupEdit.academicDegree);
      body.primaryIjazat = trimOrNull(signupEdit.primaryIjazat);
      body.approvedRiwayat = arrOrNull(signupEdit.approvedRiwayat);
      body.proficientQiraat = arrOrNull(signupEdit.proficientQiraat);
      body.ijazatObtained = arrOrNull(signupEdit.ijazatObtained);
      body.teachingSciences = arrOrNull(signupEdit.teachingSciences);
      body.authorizedBooks = trimOrNull(signupEdit.authorizedBooks);
    } else {
      body.signupPlan = trimOrNull(signupEdit.signupPlan);
      body.memorizedQuran = trimOrNull(signupEdit.memorizedQuran);
      body.amount = trimOrNull(signupEdit.amount);
      body.program = trimOrNull(signupEdit.program);
      body.weekly = trimOrNull(signupEdit.weekly);
      body.surah = trimOrNull(signupEdit.surah);
    }
    const baseUrl = serverUrl.replace(/\/$/, '');
    setSignupSaving(true);
    try {
      const res = await adminFetchJson<{
        data?: { signupProfile?: Record<string, unknown> };
      }>(`${baseUrl}/signup-options/${userModal.id}`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const fresh = res?.data?.signupProfile;
      if (fresh && typeof fresh === 'object') {
        setUserDetail((prev) => (prev ? { ...prev, signupProfile: fresh } : prev));
      }
      showMessage(t('dashboard.users.signupSaved'), 'success');
      setUserDetailTab('view');
    } catch (e) {
      showMessage(
        t('dashboard.users.signupSaveError', { message: (e as Error).message }),
        'error',
      );
    } finally {
      setSignupSaving(false);
    }
  };

  const saveSubscription = async () => {
    if (!adminToken || !userModal || !subEdit) return;
    const baseUrl = serverUrl.replace(/\/$/, '');
    const planTrim = subEdit.signupPlan.trim();
    const paidTrim = subEdit.subscriptionPaidAt.trim();
    const endsTrim = subEdit.subscriptionEndsAt.trim();
    const body: Record<string, unknown> = {
      signupPlan: planTrim === '' ? null : planTrim,
      subscriptionPaidAt: paidTrim === '' ? null : new Date(paidTrim).toISOString(),
      subscriptionEndsAt: endsTrim === '' ? null : new Date(endsTrim).toISOString(),
      assignedStudyRoomId:
        subEdit.assignedStudyRoomId === '__none__' ? null : subEdit.assignedStudyRoomId,
    };
    setSubscriptionSaving(true);
    try {
      const res = await adminFetchJson<{
        data?: { subscription?: Record<string, unknown> };
      }>(`${baseUrl}/subscription/${userModal.id}`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const fresh = res?.data?.subscription;
      if (fresh && typeof fresh === 'object') {
        setUserDetail((prev) => (prev ? { ...prev, subscription: fresh } : prev));
      }
      showMessage(t('dashboard.users.subscriptionSaved'), 'success');
      setUserDetailTab('view');
    } catch (e) {
      showMessage(
        t('dashboard.users.subscriptionSaveError', { message: (e as Error).message }),
        'error',
      );
    } finally {
      setSubscriptionSaving(false);
    }
  };

  const openComment = async (commentId: string) => {
    if (!adminToken) return;
    setCommentModal({ id: commentId });
    setCommentDetail(null);
    try {
      const data = await adminFetchJson<{ data: Record<string, unknown> }>(
        `${serverUrl}/api/comments/${commentId}`,
        adminToken,
      );
      setCommentDetail(data.data);
    } catch (e) {
      showMessage(t('dashboard.comments.loadDetailError', { message: (e as Error).message }), 'error');
    }
  };

  const deleteCommentById = async (id: string) => {
    if (!adminToken || !confirm(t('dashboard.comments.confirmDelete'))) return;
    try {
      await adminFetchJson(`${serverUrl}/api/comments/${id}`, adminToken, { method: 'DELETE' });
      showMessage(t('dashboard.comments.deleted'), 'success');
      setCommentModal(null);
      void loadComments();
    } catch (e) {
      reportAdminApiError(e, (msg) => showMessage(msg, 'error'), t);
    }
  };

  const userAction = async (path: string, method: string) => {
    if (!adminToken) return;
    try {
      await adminFetchJson(`${serverUrl}${path}`, adminToken, { method });
      showMessage(t('common.success'), 'success');
      void loadUsers();
    } catch (e) {
      reportAdminApiError(e, (msg) => showMessage(msg, 'error'), t);
    }
  };

  const [notifUsers, setNotifUsers] = useState<NotifUserRow[]>([]);
  const [notifHistory, setNotifHistory] = useState<unknown[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const loadUsersWithTokens = useCallback(async () => {
    if (!adminToken) return;
    setNotifLoading(true);
    try {
      const data = await adminFetchJson<{ users: NotifUserRow[] }>(
        `${serverUrl}/api/notifications/users`,
        adminToken,
      );
      setNotifUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e) {
      showMessage(t('dashboard.notifications.loadUsersError', { message: (e as Error).message }), 'error');
    } finally {
      setNotifLoading(false);
    }
  }, [adminToken, serverUrl, showMessage, t]);

  const loadNotificationHistory = useCallback(async () => {
    if (!adminToken) return;
    setNotifLoading(true);
    try {
      const data = await adminFetchJson<{
        data?: { notifications?: unknown[] };
      }>(`${serverUrl}/api/notifications/history`, adminToken);
      setNotifHistory(data.data?.notifications || []);
    } catch (e) {
      showMessage(t('dashboard.notifications.loadHistoryError', { message: (e as Error).message }), 'error');
    } finally {
      setNotifLoading(false);
    }
  }, [adminToken, serverUrl, showMessage, t]);

  useEffect(() => {
    if (tab === 'notifications' && adminToken) {
      void loadUsersWithTokens();
      void loadNotificationHistory();
    }
  }, [tab, adminToken, loadUsersWithTokens, loadNotificationHistory]);

  const [sendModal, setSendModal] = useState(false);
  const [sendAllModal, setSendAllModal] = useState(false);
  const [sendRoomModal, setSendRoomModal] = useState(false);
  const [notifRecipientQuery, setNotifRecipientQuery] = useState('');
  const [notifForm, setNotifForm] = useState({
    userId: '',
    title: '',
    body: '',
    type: 'general',
    sendToMultiple: false,
  });
  const [sendAllForm, setSendAllForm] = useState({ title: '', body: '', type: 'general' });
  const [roomNotifForm, setRoomNotifForm] = useState({ title: '', body: '', type: 'general' });
  const [notifRoomOptions, setNotifRoomOptions] = useState<Record<string, unknown>[]>([]);
  const [notifRoomsLoading, setNotifRoomsLoading] = useState(false);
  const [notifRoomSearch, setNotifRoomSearch] = useState('');
  const [selectedNotifRoomId, setSelectedNotifRoomId] = useState('');
  const [roomNotifyMembers, setRoomNotifyMembers] = useState<RoomNotifyMember[]>([]);
  const [roomMembersLoading, setRoomMembersLoading] = useState(false);
  const [sendingRoomNotif, setSendingRoomNotif] = useState(false);

  const [recipientPickerUsers, setRecipientPickerUsers] = useState<NotifyPickerUser[]>([]);
  const [recipientPickerLoading, setRecipientPickerLoading] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);

  const loadRecipientPickerUsers = useCallback(
    async (search: string) => {
      if (!adminToken) return;
      setRecipientPickerLoading(true);
      try {
        let url = `${serverUrl}/getUsers?page=1&limit=200`;
        const q = search.trim();
        if (q) url += `&search=${encodeURIComponent(q)}`;
        const data = await adminFetchJson<{ data: { users?: NotifyPickerUser[] } }>(url, adminToken);
        const list = Array.isArray(data.data?.users) ? data.data!.users! : [];
        const normalized = list.map((u) => {
          const row = u as NotifyPickerUser & { _id?: string };
          const id = String(row.id ?? row._id ?? '').trim();
          return { ...row, id } as NotifyPickerUser;
        });
        setRecipientPickerUsers(normalized.filter((u) => u.id.length > 0));
      } catch (e) {
        showMessage(t('dashboard.notifications.loadListError', { message: (e as Error).message }), 'error');
        setRecipientPickerUsers([]);
      } finally {
        setRecipientPickerLoading(false);
      }
    },
    [adminToken, serverUrl, showMessage, t],
  );

  const pushTokenUserIds = useMemo(() => new Set(notifUsers.map((u) => u.userId)), [notifUsers]);

  const closeSendModal = useCallback(() => {
    setSendModal(false);
    setNotifRecipientQuery('');
    setRecipientPickerUsers([]);
    setSelectedRecipientIds([]);
  }, []);

  const openSendToUserModal = useCallback((presetUserId?: string, searchHint?: string) => {
    setNotifForm((f) => ({
      ...f,
      sendToMultiple: false,
      userId: '',
    }));
    setSelectedRecipientIds(presetUserId !== undefined && presetUserId !== '' ? [presetUserId] : []);
    setNotifRecipientQuery(
      (searchHint ?? '').trim() || (presetUserId !== undefined ? presetUserId : ''),
    );
    setSendModal(true);
  }, []);

  const toggleRecipientId = useCallback((uid: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  }, []);

  useEffect(() => {
    if (sendModal && adminToken) void loadUsersWithTokens();
  }, [sendModal, adminToken, loadUsersWithTokens]);

  useEffect(() => {
    if (!sendModal || !adminToken) return;
    const delayMs = notifRecipientQuery.trim() ? 350 : 0;
    const id = window.setTimeout(() => {
      void loadRecipientPickerUsers(notifRecipientQuery);
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [sendModal, adminToken, notifRecipientQuery, loadRecipientPickerUsers]);

  const submitNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const { userId, title, body, type, sendToMultiple } = notifForm;
    if (!title.trim() || !body.trim()) {
      showMessage(t('dashboard.notifications.titleBodyRequired'), 'error');
      return;
    }
    try {
      if (sendToMultiple && !userId.trim()) {
        const userIds = notifUsers.map((u) => u.userId);
        if (!userIds.length) {
          showMessage(t('dashboard.notifications.noPushRecipients'), 'error');
          return;
        }
        await adminFetchJson(`${serverUrl}/api/notifications/send-multiple`, adminToken, {
          method: 'POST',
          body: JSON.stringify({ userIds, title, body, type }),
        });
        showMessage(t('dashboard.notifications.sentBulk', { count: userIds.length }), 'success');
      } else {
        if (!selectedRecipientIds.length) {
          showMessage(t('dashboard.notifications.selectRecipient'), 'error');
          return;
        }
        if (selectedRecipientIds.length === 1) {
          await adminFetchJson(`${serverUrl}/api/notifications/send`, adminToken, {
            method: 'POST',
            body: JSON.stringify({
              userId: selectedRecipientIds[0],
              title,
              body,
              type,
            }),
          });
          showMessage(t('dashboard.notifications.sentOne'), 'success');
        } else {
          await adminFetchJson(`${serverUrl}/api/notifications/send-multiple`, adminToken, {
            method: 'POST',
            body: JSON.stringify({ userIds: selectedRecipientIds, title, body, type }),
          });
          showMessage(t('dashboard.notifications.sentMany', { count: selectedRecipientIds.length }), 'success');
        }
      }
      closeSendModal();
      void loadUsersWithTokens();
      void loadNotificationHistory();
    } catch (e) {
      showMessage(t('dashboard.notifications.sendError', { message: (e as Error).message }), 'error');
    }
  };

  const submitSendToAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const { title, body, type } = sendAllForm;
    if (!title.trim() || !body.trim()) {
      showMessage(t('dashboard.notifications.titleBodyRequired'), 'error');
      return;
    }
    if (!confirm(t('dashboard.notifications.sendAllConfirm', { title, body }))) return;
    try {
      showMessage(t('dashboard.notifications.sendingAll'), 'info');
      const response = await adminFetchJson<{
        successCount?: number;
        total?: number;
      }>(`${serverUrl}/api/notifications/send-all`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ title, body, type }),
      });
      showMessage(
        t('dashboard.notifications.sentAll', {
          success: response.successCount ?? 0,
          total: response.total ?? 0,
        }),
        'success',
      );
      setSendAllModal(false);
      void loadUsersWithTokens();
      void loadNotificationHistory();
    } catch (e) {
      showMessage(t('dashboard.notifications.sendError', { message: (e as Error).message }), 'error');
    }
  };

  const loadNotifRooms = useCallback(async () => {
    if (!adminToken) return;
    setNotifRoomsLoading(true);
    try {
      const data = await adminFetchJson<{
        data?: { rooms?: Record<string, unknown>[] };
      }>(`${serverUrl}/rooms?page=1&limit=300&status=active`, adminToken);
      const rooms = data.data?.rooms;
      setNotifRoomOptions(Array.isArray(rooms) ? rooms : []);
    } catch (e) {
      showMessage(t('dashboard.notifications.loadRoomsError', { message: (e as Error).message }), 'error');
      setNotifRoomOptions([]);
    } finally {
      setNotifRoomsLoading(false);
    }
  }, [adminToken, serverUrl, showMessage, t]);

  const closeSendRoomModal = useCallback(() => {
    setSendRoomModal(false);
    setNotifRoomSearch('');
    setSelectedNotifRoomId('');
    setRoomNotifyMembers([]);
    setRoomNotifForm({ title: '', body: '', type: 'general' });
  }, []);

  const openSendRoomModal = useCallback(() => {
    setNotifRoomSearch('');
    setSelectedNotifRoomId('');
    setRoomNotifyMembers([]);
    setRoomNotifForm({ title: '', body: '', type: 'general' });
    setSendRoomModal(true);
    void loadUsersWithTokens();
  }, [loadUsersWithTokens]);

  const selectNotifRoom = useCallback(
    async (roomId: string) => {
      setSelectedNotifRoomId(roomId);
      setRoomNotifyMembers([]);
      if (!roomId || !adminToken) return;
      setRoomMembersLoading(true);
      try {
        const data = await adminFetchJson<{ data: Record<string, unknown> }>(
          `${serverUrl}/rooms/${roomId}`,
          adminToken,
        );
        setRoomNotifyMembers(roomMembersForNotify(data.data ?? {}));
      } catch (e) {
        showMessage(
          t('dashboard.notifications.loadRoomMembersError', { message: (e as Error).message }),
          'error',
        );
        setRoomNotifyMembers([]);
      } finally {
        setRoomMembersLoading(false);
      }
    },
    [adminToken, serverUrl, showMessage, t],
  );

  useEffect(() => {
    if (sendRoomModal && adminToken) void loadNotifRooms();
  }, [sendRoomModal, adminToken, loadNotifRooms]);

  const filteredNotifRooms = useMemo(() => {
    const q = notifRoomSearch.trim().toLowerCase();
    if (!q) return notifRoomOptions;
    return notifRoomOptions.filter((room) => {
      const id = entityId(room._id) || entityId(room.id);
      const label = roomDisplayName(room).toLowerCase();
      return label.includes(q) || id.toLowerCase().includes(q);
    });
  }, [notifRoomOptions, notifRoomSearch]);

  const submitSendToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const { title, body, type } = roomNotifForm;
    if (!title.trim() || !body.trim()) {
      showMessage(t('dashboard.notifications.titleBodyRequired'), 'error');
      return;
    }
    if (!selectedNotifRoomId) {
      showMessage(t('dashboard.notifications.selectRoom'), 'error');
      return;
    }
    const userIds = [...new Set(roomNotifyMembers.map((m) => m.id).filter(Boolean))];
    if (!userIds.length) {
      showMessage(t('dashboard.notifications.noRoomMembers'), 'error');
      return;
    }
    const withPush = userIds.filter((id) => pushTokenUserIds.has(id));
    const withoutPush = userIds.length - withPush.length;
    // Inbox always queues for offline users; do not block when no Expo tokens.
    const roomLabel =
      roomDisplayName(
        notifRoomOptions.find(
          (r) => entityId(r._id) === selectedNotifRoomId || entityId(r.id) === selectedNotifRoomId,
        ) ?? {},
      ) || selectedNotifRoomId;
    if (
      !confirm(
        t('dashboard.notifications.sendRoomConfirm', {
          room: roomLabel,
          count: userIds.length,
          withPush: withPush.length,
          withoutPush,
          title,
          body,
        }),
      )
    ) {
      return;
    }
    setSendingRoomNotif(true);
    try {
      const response = await adminFetchJson<{
        success?: boolean;
        successCount?: number;
        failureCount?: number;
        deliveredLiveCount?: number;
        queuedCount?: number;
        message?: string;
        results?: Array<{ userId?: string; success?: boolean; queued?: boolean; deliveredLive?: boolean }>;
      }>(
        userIds.length === 1
          ? `${serverUrl}/api/notifications/send`
          : `${serverUrl}/api/notifications/send-multiple`,
        adminToken,
        {
          method: 'POST',
          body: JSON.stringify(
            userIds.length === 1
              ? { userId: userIds[0], title, body, type }
              : { userIds, title, body, type },
          ),
        },
      );

      const ok =
        typeof response.successCount === 'number'
          ? response.successCount
          : Array.isArray(response.results)
            ? response.results.filter((r) => r.success).length
            : response.success === false
              ? 0
              : userIds.length;
      const failed =
        typeof response.failureCount === 'number'
          ? response.failureCount
          : Math.max(0, userIds.length - ok);
      const queued =
        typeof response.queuedCount === 'number'
          ? response.queuedCount
          : Array.isArray(response.results)
            ? response.results.filter((r) => r.queued).length
            : 0;
      const live =
        typeof response.deliveredLiveCount === 'number'
          ? response.deliveredLiveCount
          : Array.isArray(response.results)
            ? response.results.filter((r) => r.deliveredLive).length
            : 0;

      if (failed > 0 && ok === 0) {
        showMessage(
          t('dashboard.notifications.sentRoomAllFailed', {
            count: userIds.length,
            room: roomLabel,
          }),
          'error',
        );
      } else {
        showMessage(
          t('dashboard.notifications.sentRoomHybrid', {
            room: roomLabel,
            success: ok,
            live,
            queued,
            failed,
          }),
          failed > 0 ? 'info' : 'success',
        );
      }
      closeSendRoomModal();
      void loadUsersWithTokens();
      void loadNotificationHistory();
    } catch (err) {
      showMessage(t('dashboard.notifications.sendError', { message: (err as Error).message }), 'error');
    } finally {
      setSendingRoomNotif(false);
    }
  };

  const renderPagination = (pagination: Pagination | undefined, type: keyof typeof pages) => {
    if (!pagination) return null;
    const change = (p: number) => {
      setPages((prev) => ({ ...prev, [type]: p }));
    };
    return (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Btn
          variant="secondary"
          disabled={!pagination.hasPrev}
          onClick={() => change(pagination.page - 1)}
        >
          {t('common.previous')}
        </Btn>
        <span className="text-sm text-text-muted">
          {t('common.pageOf', {
            page: pagination.page,
            pages: pagination.pages,
            total: pagination.total,
          })}
        </span>
        <Btn
          variant="secondary"
          disabled={!pagination.hasNext}
          onClick={() => change(pagination.page + 1)}
        >
          {t('common.next')}
        </Btn>
      </div>
    );
  };

  const roomsData = roomsState.data as
    | { rooms?: Record<string, unknown>[]; pagination?: Pagination }
    | undefined;
  const usersData = usersState.data as
    | { users?: Record<string, unknown>[]; pagination?: Pagination }
    | undefined;
  const commentsData = commentsState.data as
    | { comments?: Record<string, unknown>[]; pagination?: Pagination }
    | undefined;
  const studentReportsData = studentReportsState.data as
    | { reports?: Record<string, unknown>[]; pagination?: Pagination }
    | undefined;
  const roomRatingsData = roomRatingsState.data as
    | { ratings?: Record<string, unknown>[]; pagination?: Pagination }
    | undefined;

  const isWideDashboardTab = tab === 'rooms' || tab === 'users';

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div
          className={`mx-auto flex w-full flex-col gap-5 lg:flex-row lg:items-center lg:justify-between ${
            isWideDashboardTab ? 'max-w-none' : 'max-w-7xl'
          }`}
        >
          <div className="shrink-0">
            <h1 className="text-xl font-semibold text-text-primary dark:text-gray-100">
              {t('dashboard.title')}
            </h1>
            {appVersion ? (
              <p className="mt-0.5 text-xs text-text-muted dark:text-gray-400">
                {t('nav.version', { version: appVersion })}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 w-full lg:max-w-5xl lg:flex-1">
            <AdminAuthBar />
          </div>
        </div>
      </header>

      <nav className="dashboard-nav-tabs flex flex-wrap justify-start gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-950">
        {(
          [
            ['rooms', t('dashboard.tabs.rooms')],
            ['users', t('dashboard.tabs.users')],
            ['comments', t('dashboard.tabs.comments')],
            ['studentReports', t('dashboard.tabs.studentReports')],
            ['roomRatings', t('dashboard.tabs.roomRatings')],
            ['notifications', t('dashboard.tabs.notifications')],
            ['signupPlans', t('dashboard.tabs.signupPlans')],
            ['offers', t('dashboard.tabs.offers')],
            ['siteAgreement', t('dashboard.tabs.siteAgreement')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-brand-primary text-white'
                : 'bg-white text-text-secondary shadow-sm hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main
        className={`mx-auto w-full space-y-6 overflow-x-hidden p-4 sm:p-6 ${isWideDashboardTab ? '' : 'max-w-7xl'}`}
      >
        {tab === 'rooms' && (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t('dashboard.rooms.title')}</h2>
              <Btn variant="success" onClick={openCreateRoom}>
                {t('dashboard.rooms.create')}
              </Btn>
            </div>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder={t('dashboard.rooms.searchPlaceholder')}
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                onBlur={() => void loadRooms()}
              />
              <Select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                onBlur={() => void loadRooms()}
              >
                <option value="">{t('dashboard.rooms.allTypes')}</option>
                {ROOM_TYPE_COUNTS.map((n) => (
                  <option key={n} value={String(n)}>
                    {t('dashboard.rooms.persons', { count: n })}
                  </option>
                ))}
              </Select>
              <Select
                value={roomStatusFilter}
                onChange={(e) => setRoomStatusFilter(e.target.value as RoomListStatus)}
                onBlur={() => void loadRooms()}
              >
                <option value={RoomListStatus.ALL}>{t('dashboard.rooms.statusFilterAll')}</option>
                <option value={RoomListStatus.ACTIVE}>{t('dashboard.rooms.statusFilterActive')}</option>
                <option value={RoomListStatus.INACTIVE}>{t('dashboard.rooms.statusFilterInactive')}</option>
              </Select>
              <Btn variant="info" onClick={() => void loadRooms()}>
                {t('common.refresh')}
              </Btn>
            </div>
            {roomsState.loading ? (
              <p className="text-text-muted">{t('common.loading')}</p>
            ) : roomsState.error ? (
              <p className="text-red-600">{roomsState.error}</p>
            ) : !roomsData?.rooms?.length ? (
              <p className="text-text-muted">{t('dashboard.rooms.noRooms')}</p>
            ) : (
              <>
                <TableShell
                  className="admin-striped-table w-full"
                  colWidths={[
                    '10%',
                    '10%',
                    '7%',
                    '11%',
                    '5%',
                    '13%',
                    '12%',
                    '9%',
                    '7%',
                    '16%',
                  ]}
                >
                  <thead>
                    <tr>
                      {[
                        t('dashboard.rooms.cols.arabic'),
                        t('dashboard.rooms.cols.english'),
                        t('dashboard.rooms.cols.type'),
                        t('dashboard.rooms.cols.schedule'),
                        t('dashboard.rooms.cols.cap'),
                        t('dashboard.rooms.cols.participants'),
                        t('dashboard.rooms.cols.teacher'),
                        t('dashboard.rooms.cols.createdBy'),
                        t('dashboard.rooms.cols.status'),
                        t('dashboard.rooms.cols.actions'),
                      ].map((h, colIndex) => (
                          <th
                            key={`room-col-${colIndex}`}
                            className={tableHeadClass}
                          >
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roomsData.rooms.map((room) => (
                      <tr key={String(room._id)}>
                        <td className={`${tableCellClass} break-words`}>
                          {escapeHtml(room.nameAr)}
                        </td>
                        <td className={`${tableCellClass} break-words`}>
                          {escapeHtml(room.nameEn)}
                        </td>
                        <td className={tableCellClass}>
                          {t('dashboard.rooms.persons', { count: Number(room.type) })}
                        </td>
                        <td className={`${tableCellClass} text-xs break-words`}>
                          {formatRoomScheduleCell(room, t)}
                        </td>
                        <td className={tableCellClass}>{formatRoomOccupancy(room)}</td>
                        <td className={`${tableCellClass} text-xs`}>
                          <RoomParticipantsCell
                            room={room}
                            emptyLabel={t('dashboard.rooms.noParticipants')}
                          />
                        </td>
                        <td className={`${tableCellClass} text-xs`}>
                          <Select
                            className="w-full max-w-full text-xs"
                            value={reservedTeacherIdFromRoom(room)}
                            onChange={(e) =>
                              void assignRoomTeacher(
                                entityId(room._id) || entityId(room.id),
                                e.target.value,
                              )
                            }
                          >
                            <option value="__none__">
                              {t('dashboard.rooms.noTeacherOption')}
                            </option>
                            {(() => {
                              const currentId = reservedTeacherIdFromRoom(room);
                              const opts = [...roomTeacherOptions];
                              if (
                                currentId !== '__none__' &&
                                !opts.some((o) => o.id === currentId)
                              ) {
                                const rt = room.reservedTeacher;
                                let label = currentId;
                                if (rt && typeof rt === 'object' && rt !== null) {
                                  const first = String(
                                    (rt as { firstName?: string }).firstName ?? '',
                                  ).trim();
                                  const last = String(
                                    (rt as { lastName?: string }).lastName ?? '',
                                  ).trim();
                                  const email = String(
                                    (rt as { email?: string }).email ?? '',
                                  ).trim();
                                  label = `${first} ${last}`.trim() || email || currentId;
                                }
                                opts.unshift({ id: currentId, label });
                              }
                              return opts.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ));
                            })()}
                          </Select>
                        </td>
                        <td className={`${tableCellClass} text-xs break-words`}>
                          {room.createdBy &&
                          typeof room.createdBy === 'object' &&
                          room.createdBy !== null
                            ? `${(room.createdBy as { firstName?: string }).firstName ?? ''} ${(room.createdBy as { lastName?: string }).lastName ?? ''}`
                            : t('common.na')}
                        </td>
                        <td className={tableCellClass}>
                          {room.isActive !== false ? (
                            <span className="text-emerald-600">{t('dashboard.rooms.active')}</span>
                          ) : (
                            <span className="text-red-600">{t('dashboard.rooms.inactive')}</span>
                          )}
                        </td>
                        <td className={tableCellClass}>
                          <div className="flex flex-wrap gap-1">
                          <Btn
                            variant="info"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void openLiveKitRoomView(room)}
                          >
                            {t('dashboard.rooms.view')}
                          </Btn>
                          <Btn
                            variant="warning"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void editRoom(String(room._id))}
                          >
                            {t('dashboard.rooms.edit')}
                          </Btn>
                          {room.isActive !== false ? (
                            <Btn
                              variant="danger"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void setRoomActive(String(room._id), false)}
                            >
                              {t('dashboard.rooms.deactivate')}
                            </Btn>
                          ) : (
                            <Btn
                              variant="success"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void setRoomActive(String(room._id), true)}
                            >
                              {t('dashboard.rooms.activate')}
                            </Btn>
                          )}
                          <Btn
                            variant="danger"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void deleteRoom(String(room._id))}
                          >
                            {t('dashboard.rooms.delete')}
                          </Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                {renderPagination(roomsData.pagination, 'rooms')}
              </>
            )}
          </Card>
        )}

        {tab === 'users' && (
          <Card className="max-w-full overflow-x-hidden">
            <h2 className="mb-4 text-lg font-semibold">{t('dashboard.users.title')}</h2>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder={t('dashboard.users.searchPlaceholder')}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onBlur={() => void loadUsers()}
              />
              <Select value={userRole} onChange={(e) => setUserRole(e.target.value)} onBlur={() => void loadUsers()}>
                <option value="">{t('dashboard.users.allRoles')}</option>
                <option value="student">{t('dashboard.users.student')}</option>
                <option value="teacher">{t('dashboard.users.teacher')}</option>
                <option value="admin">{t('dashboard.users.admin')}</option>
              </Select>
              <Btn variant="info" onClick={() => void loadUsers()}>
                {t('common.refresh')}
              </Btn>
            </div>
            {usersState.loading ? (
              <p className="text-text-muted">{t('common.loading')}</p>
            ) : usersState.error ? (
              <p className="text-red-600">{usersState.error}</p>
            ) : !usersData?.users?.length ? (
              <p className="text-text-muted">{t('dashboard.users.noUsers')}</p>
            ) : (
              <>
                <TableShell
                  className="admin-striped-table admin-users-table w-full max-w-full"
                  colWidths={[
                    '12%',
                    '16%',
                    '7%',
                    '10%',
                    '8%',
                    '8%',
                    '6%',
                    '6%',
                    '27%',
                  ]}
                >
                  <thead>
                    <tr>
                      {[
                        t('dashboard.users.cols.name'),
                        t('dashboard.users.cols.email'),
                        t('dashboard.users.cols.role'),
                        t('dashboard.users.cols.plan'),
                        t('dashboard.users.cols.signIn'),
                        t('dashboard.users.cols.profile'),
                        t('dashboard.users.cols.active'),
                        t('dashboard.users.cols.frozen'),
                        t('dashboard.users.cols.actions'),
                      ].map((h, colIndex) => (
                        <th key={`user-col-${colIndex}`} className={tableHeadClass}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.users.map((user) => (
                      <tr
                        key={String(user.id)}
                        className="cursor-pointer"
                        onClick={() => void openUser(String(user.id))}
                      >
                        <td className={`${tableCellClass} break-words text-base`}>
                          {escapeHtml(user.firstName)} {escapeHtml(user.lastName)}
                        </td>
                        <td className={`${tableCellClass} break-all text-base`}>{escapeHtml(user.email)}</td>
                        <td className={`${tableCellClass} break-words text-base`}>{escapeHtml(user.role)}</td>
                        <td className={`${tableCellClass} break-words text-base`}>
                          {String(user.role ?? '') === 'teacher' ? (
                            <span className="text-text-muted">—</span>
                          ) : typeof user.signupPlan === 'string' &&
                            user.signupPlan.trim() !== '' ? (
                            <span title={user.signupPlan}>
                              {escapeHtml(signupQuizOptionLabel(user.signupPlan, t))}
                            </span>
                          ) : (
                            <span className="text-text-muted">{t('dashboard.users.noPlan')}</span>
                          )}
                        </td>
                        <td className={tableCellClass}>
                          <UserSignInBadge provider={user.provider} t={t} />
                        </td>
                        <td className={tableCellClass}>
                          <UserProfileBadge
                            incomplete={user.isSignupProfileIncomplete === true}
                            t={t}
                          />
                        </td>
                        <td className={`${tableCellClass} break-words text-base`}>
                          {user.active !== false ? t('dashboard.users.active') : t('dashboard.users.inactive')}
                        </td>
                        <td className={`${tableCellClass} break-words text-base`}>
                          {user.isFrozen ? t('dashboard.users.frozen') : t('dashboard.users.notFrozen')}
                        </td>
                        <td className={`${tableCellClass} max-w-0`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex max-w-full flex-wrap gap-1.5">
                          <Btn
                            variant="info"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => {
                              const uid = String(user.id);
                              const email =
                                typeof user.email === 'string' ? user.email.trim() : '';
                              openSendToUserModal(uid, email || uid);
                            }}
                          >
                            {t('dashboard.users.sendNotification')}
                          </Btn>
                          {user.role !== 'admin' && (
                            <>
                              {user.active !== false ? (
                                <Btn
                                  variant="warning"
                                  className="!px-2 !py-1 text-xs"
                                  onClick={() => {
                                    if (confirm(t('dashboard.users.confirmDeactivate')))
                                      void userAction(`/deactivate/${user.id}`, 'PATCH');
                                  }}
                                >
                                  {t('dashboard.users.deactivate')}
                                </Btn>
                              ) : (
                                <Btn
                                  variant="success"
                                  className="!px-2 !py-1 text-xs"
                                  onClick={() => void userAction(`/activate/${user.id}`, 'PATCH')}
                                >
                                  {t('dashboard.users.activate')}
                                </Btn>
                              )}
                            </>
                          )}
                          {adminUserId && String(user.id) === adminUserId ? null : !user.isFrozen ? (
                            <Btn
                              variant="warning"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => {
                                if (confirm(t('dashboard.users.confirmFreeze')))
                                  void userAction(`/freeze-account/${user.id}`, 'DELETE');
                              }}
                            >
                              {t('dashboard.users.freeze')}
                            </Btn>
                          ) : (
                            <Btn
                              variant="success"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void userAction(`/unfreeze-account/${user.id}`, 'PATCH')}
                            >
                              {t('dashboard.users.unfreeze')}
                            </Btn>
                          )}
                          {user.role !== 'admin' && (
                            <Btn
                              variant="danger"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => {
                                if (confirm(t('dashboard.users.confirmDelete')))
                                  void userAction(`/delete-account/${user.id}`, 'DELETE');
                              }}
                            >
                              {t('common.delete')}
                            </Btn>
                          )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                {renderPagination(usersData.pagination, 'users')}
              </>
            )}
          </Card>
        )}

        {tab === 'comments' && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold">{t('dashboard.comments.title')}</h2>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder={t('dashboard.comments.searchPlaceholder')}
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                onBlur={() => void loadComments()}
              />
              <Btn variant="info" onClick={() => void loadComments()}>
                {t('common.refresh')}
              </Btn>
            </div>
            {commentsState.loading ? (
              <p className="text-text-muted">{t('common.loading')}</p>
            ) : commentsState.error ? (
              <p className="text-red-600">{commentsState.error}</p>
            ) : !commentsData?.comments?.length ? (
              <p className="text-text-muted">{t('dashboard.comments.noComments')}</p>
            ) : (
              <>
                <TableShell colWidths={['38%', '14%', '18%', '15%', '15%']}>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {[
                        t('dashboard.comments.cols.content'),
                        t('dashboard.comments.cols.author'),
                        t('dashboard.comments.cols.post'),
                        t('dashboard.comments.cols.created'),
                        '',
                      ].map((h) => (
                        <th
                          key={h}
                          className={tableHeadClass}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {commentsData.comments.map((c) => (
                      <tr
                        key={String(c.id)}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => void openComment(String(c.id))}
                      >
                        <td className="max-w-xs truncate px-3 py-2">
                          {escapeHtml(String(c.content ?? '').slice(0, 80))}…
                        </td>
                        <td className="px-3 py-2">
                          {c.author && typeof c.author === 'object'
                            ? `${(c.author as { firstName?: string }).firstName ?? ''} ${(c.author as { lastName?: string }).lastName ?? ''}`
                            : t('common.na')}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.postTitle
                            ? String(c.postTitle)
                            : c.postId
                              ? String(c.postId).slice(0, 8) + '…'
                              : t('common.na')}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.createdAt ? new Date(String(c.createdAt)).toLocaleDateString() : ''}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Btn
                            variant="danger"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void deleteCommentById(String(c.id))}
                          >
                            {t('common.delete')}
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                {renderPagination(commentsData.pagination, 'comments')}
              </>
            )}
          </Card>
        )}

        {tab === 'studentReports' && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold">{t('dashboard.studentReports.title')}</h2>
            <p className="mb-4 text-sm text-text-muted">{t('dashboard.studentReports.hint')}</p>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder={t('dashboard.studentReports.searchPlaceholder')}
                value={studentReportSearch}
                onChange={(e) => setStudentReportSearch(e.target.value)}
                onBlur={() => void loadStudentReports()}
              />
              <Btn variant="info" onClick={() => void loadStudentReports()}>
                {t('common.refresh')}
              </Btn>
            </div>
            {studentReportsState.loading ? (
              <p className="text-text-muted">{t('common.loading')}</p>
            ) : studentReportsState.error ? (
              <p className="text-red-600">{studentReportsState.error}</p>
            ) : !studentReportsData?.reports?.length ? (
              <p className="text-text-muted">{t('dashboard.studentReports.noReports')}</p>
            ) : (
              <>
                <TableShell className="admin-striped-table" colWidths={['12%', '12%', '14%', '40%', '14%']}>
                  <thead>
                    <tr>
                      {[
                        t('dashboard.studentReports.cols.student'),
                        t('dashboard.studentReports.cols.teacher'),
                        t('dashboard.studentReports.cols.room'),
                        t('dashboard.studentReports.cols.report'),
                        t('dashboard.studentReports.cols.date'),
                      ].map((h) => (
                        <th
                          key={h}
                          className={tableHeadClass}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {studentReportsData.reports.map((row) => {
                      const student = row.student as
                        | { firstName?: string; lastName?: string; email?: string }
                        | undefined;
                      const teacher = row.teacher as
                        | { firstName?: string; lastName?: string }
                        | undefined;
                      const room = row.room as { nameEn?: string; nameAr?: string } | undefined;
                      const name = (u?: { firstName?: string; lastName?: string }) =>
                        `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || '—';
                      const fullReport = String(row.reportText ?? '');
                      const preview =
                        fullReport.length > 140 ? `${escapeHtml(fullReport.slice(0, 140))}…` : escapeHtml(fullReport);
                      return (
                        <tr
                          key={String(row.id)}
                          className="cursor-pointer"
                          onClick={() => setSelectedSessionReport(row as SessionStudentReportRow)}
                        >
                          <td className={`${tableCellClass} text-sm`}>
                            <div>{escapeHtml(name(student))}</div>
                            {student?.email ? (
                              <div className="text-xs text-text-muted">{escapeHtml(String(student.email))}</div>
                            ) : null}
                          </td>
                          <td className={`${tableCellClass} text-sm`}>{escapeHtml(name(teacher))}</td>
                          <td className={`${tableCellClass} text-sm`}>
                            {room?.nameEn || room?.nameAr
                              ? escapeHtml(String(room.nameEn ?? room.nameAr))
                              : '—'}
                          </td>
                          <td
                            className={`${tableCellClass} text-sm break-words whitespace-pre-wrap`}
                            title={fullReport.length > 140 ? fullReport : undefined}
                          >
                            {preview || '—'}
                          </td>
                          <td className={`${tableCellClass} whitespace-nowrap text-xs`}>
                            {row.createdAt
                              ? new Date(String(row.createdAt)).toLocaleString()
                              : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>
                {renderPagination(studentReportsData.pagination, 'studentReports')}
              </>
            )}
          </Card>
        )}

        {tab === 'roomRatings' && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold">{t('dashboard.roomRatings.title')}</h2>
            <p className="mb-4 text-sm text-text-muted">{t('dashboard.roomRatings.hint')}</p>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder={t('dashboard.roomRatings.searchPlaceholder')}
                value={roomRatingSearch}
                onChange={(e) => setRoomRatingSearch(e.target.value)}
                onBlur={() => void loadRoomRatings()}
              />
              <Btn variant="info" onClick={() => void loadRoomRatings()}>
                {t('common.refresh')}
              </Btn>
            </div>
            {roomRatingsState.loading ? (
              <p className="text-text-muted">{t('common.loading')}</p>
            ) : roomRatingsState.error ? (
              <p className="text-red-600">{roomRatingsState.error}</p>
            ) : !roomRatingsData?.ratings?.length ? (
              <p className="text-text-muted">{t('dashboard.roomRatings.noRatings')}</p>
            ) : (
              <>
                <TableShell colWidths={['12%', '12%', '14%', '40%', '14%']}>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {[
                        t('dashboard.roomRatings.cols.student'),
                        t('dashboard.roomRatings.cols.room'),
                        t('dashboard.roomRatings.cols.rating'),
                        t('dashboard.roomRatings.cols.comment'),
                        t('dashboard.roomRatings.cols.date'),
                      ].map((h) => (
                        <th
                          key={h}
                          className={tableHeadClass}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {roomRatingsData.ratings.map((row) => {
                      const student = row.student as
                        | { firstName?: string; lastName?: string; email?: string }
                        | undefined;
                      const room = row.room as { nameEn?: string; nameAr?: string } | undefined;
                      const name = (u?: { firstName?: string; lastName?: string }) =>
                        `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || '—';
                      return (
                        <tr key={String(row.id)} className="dark:bg-gray-800/50">
                          <td className={`${tableCellClass} text-sm`}>
                            <div>{escapeHtml(name(student))}</div>
                            {student?.email ? (
                              <div className="text-xs text-text-muted">{escapeHtml(String(student.email))}</div>
                            ) : null}
                          </td>
                          <td className={`${tableCellClass} text-sm`}>
                            {room?.nameEn || room?.nameAr
                              ? escapeHtml(String(room.nameEn ?? room.nameAr))
                              : '—'}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {t('dashboard.roomRatings.ratingOf', { rating: String(row.rating ?? '—') })}
                          </td>
                          <td className={`${tableCellClass} text-sm break-words whitespace-pre-wrap`}>
                            {row.comment ? escapeHtml(String(row.comment)) : '—'}
                          </td>
                          <td className={`${tableCellClass} whitespace-nowrap text-xs`}>
                            {row.createdAt
                              ? new Date(String(row.createdAt)).toLocaleString()
                              : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>
                {renderPagination(roomRatingsData.pagination, 'roomRatings')}
              </>
            )}
          </Card>
        )}

        {tab === 'notifications' && (
          <div className="space-y-6">
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{t('dashboard.notifications.pushTitle')}</h2>
                <div className="flex flex-wrap gap-2">
                  <Btn variant="success" onClick={() => openSendToUserModal()}>
                    {t('dashboard.notifications.sendToUser')}
                  </Btn>
                  <Btn variant="info" onClick={() => openSendRoomModal()}>
                    {t('dashboard.notifications.sendToRoom')}
                  </Btn>
                  <Btn variant="warning" onClick={() => setSendAllModal(true)}>
                    {t('dashboard.notifications.sendToAll')}
                  </Btn>
                  <Btn variant="secondary" onClick={() => void loadUsersWithTokens()} disabled={notifLoading}>
                    {t('dashboard.notifications.refreshUsers')}
                  </Btn>
                </div>
              </div>
              {!notifUsers.length ? (
                <p className="text-text-muted">{t('dashboard.notifications.noPushUsers')}</p>
              ) : (
                <TableShell colWidths={['10%', '14%', '18%', '12%', '8%', '14%', '24%']}>
                  <thead>
                    <tr>
                      {[
                        t('dashboard.notifications.cols.userId'),
                        t('dashboard.notifications.cols.user'),
                        t('dashboard.notifications.cols.email'),
                        t('dashboard.notifications.cols.platforms'),
                        t('dashboard.notifications.cols.tokens'),
                        t('dashboard.notifications.cols.lastUsed'),
                        '',
                      ].map((h) => (
                        <th key={h} className={tableHeadClass}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {notifUsers.map((u) => (
                      <tr key={u.userId}>
                        <td className="max-w-[8rem] truncate px-3 py-2 font-mono text-xs">{u.userId}</td>
                        <td className="px-3 py-2">
                          {u.user
                            ? `${u.user.firstName ?? ''} ${u.user.lastName ?? ''}`.trim()
                            : t('common.unknown')}
                        </td>
                        <td className="px-3 py-2">{u.user?.email ?? ''}</td>
                        <td className="px-3 py-2">{u.platforms?.join(', ')}</td>
                        <td className="px-3 py-2">{u.tokenCount ?? 0}</td>
                        <td className="px-3 py-2 text-xs">
                          {u.lastUsed ? new Date(u.lastUsed).toLocaleString() : t('common.never')}
                        </td>
                        <td className="px-3 py-2">
                          <Btn
                            variant="primary"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => openSendToUserModal(u.userId)}
                          >
                            {t('dashboard.notifications.send')}
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </Card>
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('dashboard.notifications.historyTitle')}</h2>
                <Btn variant="info" onClick={() => void loadNotificationHistory()} disabled={notifLoading}>
                  {t('common.refresh')}
                </Btn>
              </div>
              {!notifHistory.length ? (
                <p className="text-text-muted">{t('dashboard.notifications.noHistory')}</p>
              ) : (
                <TableShell colWidths={['12%', '22%', '8%', '24%', '7%', '7%', '20%']}>
                  <thead>
                    <tr>
                      {[
                        t('dashboard.notifications.cols.title'),
                        t('dashboard.notifications.cols.body'),
                        t('dashboard.notifications.cols.type'),
                        t('dashboard.notifications.cols.recipients'),
                        t('dashboard.notifications.cols.success'),
                        t('dashboard.notifications.cols.failed'),
                        t('dashboard.notifications.cols.date'),
                      ].map((h) => (
                        <th key={h} className={tableHeadClass}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notifHistory.map((n, i) => {
                      const row = n as Record<string, unknown>;
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium">{escapeHtml(String(row.title ?? ''))}</td>
                          <td className="max-w-xs truncate px-3 py-2">{escapeHtml(String(row.body ?? ''))}</td>
                          <td className="px-3 py-2">{escapeHtml(String(row.type ?? ''))}</td>
                          <td
                            className="whitespace-pre-wrap break-words px-3 py-2 text-sm"
                            title={formatNotificationHistoryRecipients(row, t)}
                          >
                            {escapeHtml(formatNotificationHistoryRecipients(row, t))}
                          </td>
                          <td className="px-3 py-2 text-emerald-600">{String(row.successCount ?? '')}</td>
                          <td className="px-3 py-2 text-red-600">{String(row.failureCount ?? '')}</td>
                          <td className="px-3 py-2 text-xs">
                            {row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>
              )}
            </Card>
          </div>
        )}

        {tab === 'signupPlans' && <SignupPlansPanel />}
        {tab === 'offers' && <SignupOffersPanel />}
        {tab === 'siteAgreement' && <SiteAgreementPanel />}
      </main>

      {selectedSessionReport ? (
        <StudentReportDetailModal
          key={selectedSessionReport.id}
          open
          onClose={() => setSelectedSessionReport(null)}
          sessionRow={selectedSessionReport}
          serverUrl={serverUrl}
          adminToken={adminToken}
        />
      ) : null}

      <Modal
        open={roomModal}
        onClose={() => setRoomModal(false)}
        title={editingRoomId ? t('dashboard.rooms.modalEdit') : t('dashboard.rooms.modalCreate')}
      >
        <form onSubmit={(e) => void submitRoom(e)} className="space-y-4">
          <Field label={t('dashboard.rooms.nameAr')}>
            <Input
              required
              value={roomForm.nameAr}
              onChange={(e) => setRoomForm((f) => ({ ...f, nameAr: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.rooms.nameEn')}>
            <Input
              required
              value={roomForm.nameEn}
              onChange={(e) => setRoomForm((f) => ({ ...f, nameEn: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.rooms.description')}>
            <TextArea
              rows={3}
              value={roomForm.description}
              onChange={(e) => setRoomForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.rooms.roomType')}>
            <Select
              required
              value={roomForm.type}
              onChange={(e) => setRoomForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="">{t('dashboard.rooms.selectType')}</option>
              {ROOM_TYPE_COUNTS.map((n) => (
                <option key={n} value={String(n)}>
                  {t('dashboard.rooms.persons', { count: n })}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <p className="mb-3 text-sm font-medium text-text-secondary">
              {t('dashboard.rooms.scheduleSection')}
            </p>
            <Field label={t('dashboard.rooms.scheduleDaysLabel')}>
              <div className="flex flex-wrap gap-2">
                {ROOM_SCHEDULE_DAY_VALUES.map((d) => {
                  const checked = roomForm.scheduleDays.includes(d);
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
                        onChange={() => toggleScheduleDay(d)}
                      />
                      {t(`dashboard.rooms.scheduleDays.${d}`)}
                    </label>
                  );
                })}
              </div>
            </Field>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('dashboard.rooms.scheduleFrom')}>
                <Select
                  required
                  value={roomForm.scheduleTimeFrom}
                  onChange={(e) => {
                    const nextFrom = e.target.value;
                    setRoomForm((f) => ({
                      ...f,
                      scheduleTimeFrom: nextFrom,
                      scheduleTimeTo:
                        f.scheduleTimeTo && nextFrom && f.scheduleTimeTo <= nextFrom
                          ? ''
                          : f.scheduleTimeTo,
                    }));
                  }}
                >
                  <option value="">{t('dashboard.rooms.scheduleSelectTime')}</option>
                  {scheduleTimeOptionsForSelect(roomForm.scheduleTimeFrom).map((o) => (
                    <option key={`from-${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('dashboard.rooms.scheduleTo')}>
                <Select
                  required
                  value={roomForm.scheduleTimeTo}
                  onChange={(e) =>
                    setRoomForm((f) => ({ ...f, scheduleTimeTo: e.target.value }))
                  }
                >
                  <option value="">{t('dashboard.rooms.scheduleSelectTime')}</option>
                  {scheduleTimeOptionsForSelect(
                    roomForm.scheduleTimeTo,
                    roomForm.scheduleTimeFrom || undefined,
                  ).map((o) => (
                    <option key={`to-${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <Field label={t('dashboard.rooms.assignTeacher')}>
            <Select
              value={roomForm.reservedTeacherId}
              onChange={(e) =>
                setRoomForm((f) => ({ ...f, reservedTeacherId: e.target.value }))
              }
            >
              <option value="__none__">{t('dashboard.rooms.noTeacherOption')}</option>
              {(() => {
                const currentId = roomForm.reservedTeacherId;
                const opts = [...roomTeacherOptions];
                if (
                  currentId !== '__none__' &&
                  currentId &&
                  !opts.some((o) => o.id === currentId)
                ) {
                  opts.unshift({ id: currentId, label: currentId });
                }
                return opts.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ));
              })()}
            </Select>
            <p className="mt-1 text-xs text-text-muted">
              {t('dashboard.rooms.assignTeacherHint')}
            </p>
          </Field>
          <Field label={t('dashboard.rooms.participantIds')}>
            <Input
              value={roomForm.participants}
              onChange={(e) => setRoomForm((f) => ({ ...f, participants: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" type="button" onClick={() => setRoomModal(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant="primary" type="submit">
              {t('common.save')}
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={!!userModal} onClose={() => setUserModal(null)} title={t('dashboard.users.detailTitle')} wide>
        {!userDetail ? (
          <p>{t('common.loading')}</p>
        ) : (
          <div className="space-y-6 text-sm">
            <div className="space-y-2">
              <p>
                <strong>{t('dashboard.users.name')}:</strong> {String(userDetail.firstName)}{' '}
                {String(userDetail.lastName)}
              </p>
              <p>
                <strong>{t('dashboard.users.email')}:</strong> {String(userDetail.email ?? '')}
              </p>
              <p>
                <strong>{t('dashboard.users.role')}:</strong> {String(userDetail.role ?? '')}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <strong>{t('dashboard.users.detailSignIn')}:</strong>
                <UserSignInBadge provider={userDetail.provider} t={t} />
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <strong>{t('dashboard.users.detailProfileStatus')}:</strong>
                <UserProfileBadge
                  incomplete={userDetail.isSignupProfileIncomplete === true}
                  t={t}
                />
              </p>
              <p>
                <strong>{t('dashboard.users.phone')}:</strong> {String(userDetail.phone ?? '')}
              </p>
              {userDetail.age != null && String(userDetail.age) !== '' ? (
                <p>
                  <strong>{t('dashboard.users.age')}:</strong> {String(userDetail.age)}
                </p>
              ) : null}
              <p>
                <strong>{t('dashboard.users.created')}:</strong>{' '}
                {userDetail.createdAt ? new Date(String(userDetail.createdAt)).toLocaleString() : ''}
              </p>
              {String(userDetail.role ?? '') !== 'teacher'
                ? (() => {
                    const subRaw = userDetail.subscription;
                    if (!subRaw || typeof subRaw !== 'object') return null;
                    const tier =
                      typeof (subRaw as { tier?: unknown }).tier === 'string'
                        ? String((subRaw as { tier: string }).tier)
                        : '';
                    if (!tier) return null;
                    return (
                      <p className="text-text-secondary">
                        <strong>{t('dashboard.users.subscriptionTierLabel')}:</strong>{' '}
                        {tier === 'paid'
                          ? t('dashboard.users.subscriptionTierPaid')
                          : t('dashboard.users.subscriptionTierFree')}
                      </p>
                    );
                  })()
                : null}
            </div>

            <div className="flex gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
              {(
                [
                  ['view', t('dashboard.users.detailTabView')],
                  ['edit', t('dashboard.users.detailTabEdit')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id === 'view' && userDetail) {
                      setSignupEdit(signupDraftFromUserDetail(userDetail));
                      setSubEdit(subscriptionDraftFromUserDetail(userDetail));
                    }
                    setUserDetailTab(id);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    userDetailTab === id
                      ? 'bg-brand-primary text-white'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {userDetailTab === 'view' ? (
              <div className="space-y-6">
                {signupEdit ? (
                  <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                    <p className="mb-4 font-semibold text-text-secondary">
                      {t('dashboard.users.signupSection')}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupUserType')}
                        value={
                          signupEdit.userType === SignupUserType.MALE
                            ? t('dashboard.users.signupUserTypeMale')
                            : signupEdit.userType === SignupUserType.FEMALE
                              ? t('dashboard.users.signupUserTypeFemale')
                              : signupEdit.userType === SignupUserType.CHILDREN
                                ? t('dashboard.users.signupUserTypeChildren')
                                : ''
                        }
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupDateOfBirth')}
                        value={signupEdit.dateOfBirth}
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupLanguageTag')}
                        value={signupEdit.languageTag}
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupPreferredLanguage')}
                        value={signupEdit.preferredLanguage}
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupNationality')}
                        value={signupEdit.nationality}
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupCountryResidence')}
                        value={signupEdit.countryResidence}
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.signupMotherTongue')}
                        value={signupEdit.motherTongue}
                      />
                      {String(userDetail.role ?? '') === 'teacher' ? (
                        <>
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupOtherLanguages')}
                            value={
                              signupEdit.otherLanguages
                                ? signupTeacherOptionLabel(signupEdit.otherLanguages, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupAcademicDegree')}
                            value={
                              signupEdit.academicDegree
                                ? signupTeacherOptionLabel(signupEdit.academicDegree, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupPrimaryIjazat')}
                            value={
                              signupEdit.primaryIjazat
                                ? signupTeacherOptionLabel(signupEdit.primaryIjazat, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupProficientQiraat')}
                            value={formatJoinedLabels(signupEdit.proficientQiraat, (v) =>
                              signupTeacherOptionLabel(v, t),
                            )}
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupIjazatObtained')}
                            value={formatJoinedLabels(signupEdit.ijazatObtained, (v) =>
                              signupTeacherOptionLabel(v, t),
                            )}
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupApprovedRiwayat')}
                            value={formatJoinedLabels(signupEdit.approvedRiwayat, (v) =>
                              signupTeacherOptionLabel(v, t),
                            )}
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupTeachingSciences')}
                            value={formatJoinedLabels(signupEdit.teachingSciences, (v) =>
                              signupTeacherOptionLabel(v, t),
                            )}
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupAuthorizedBooks')}
                            value={signupEdit.authorizedBooks}
                          />
                        </>
                      ) : (
                        <>
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupMemorizedQuran')}
                            value={
                              signupEdit.memorizedQuran
                                ? signupQuizOptionLabel(signupEdit.memorizedQuran, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupAmount')}
                            value={
                              signupEdit.amount
                                ? signupQuizOptionLabel(signupEdit.amount, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupProgram')}
                            value={
                              signupEdit.program
                                ? signupQuizOptionLabel(signupEdit.program, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupWeekly')}
                            value={
                              signupEdit.weekly
                                ? signupQuizOptionLabel(signupEdit.weekly, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupSurah')}
                            value={
                              signupEdit.surah
                                ? signupQuizOptionLabel(signupEdit.surah, t)
                                : ''
                            }
                          />
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.signupPlan')}
                            value={
                              signupEdit.signupPlan
                                ? signupQuizOptionLabel(signupEdit.signupPlan, t)
                                : ''
                            }
                          />
                        </>
                      )}
                    </div>
                  </div>
                ) : null}

                {subEdit && String(userDetail.role ?? '') !== 'teacher' ? (
                  <div className="border-t border-blue-900/15 bg-blue-50/40 px-1 py-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <p className="mb-4 font-semibold text-text-secondary">
                      {t('dashboard.users.subscriptionSection')}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.subscriptionPlan')}
                        value={
                          subEdit.signupPlan
                            ? signupQuizOptionLabel(subEdit.signupPlan, t)
                            : ''
                        }
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.subscriptionPaidAt')}
                        value={
                          subEdit.subscriptionPaidAt
                            ? new Date(subEdit.subscriptionPaidAt).toLocaleString()
                            : ''
                        }
                      />
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.subscriptionEndsAt')}
                        value={
                          subEdit.subscriptionEndsAt
                            ? new Date(subEdit.subscriptionEndsAt).toLocaleString()
                            : ''
                        }
                      />
                      {(() => {
                        const subRaw = userDetail.subscription;
                        if (!subRaw || typeof subRaw !== 'object') return null;
                        const active = (subRaw as { accessActive?: boolean }).accessActive;
                        if (active === undefined) return null;
                        return (
                          <UserDetailReadonlyRow
                            label={t('dashboard.users.subscriptionAccessLabel')}
                            value={
                              active
                                ? t('dashboard.users.subscriptionAccessActive')
                                : t('dashboard.users.subscriptionAccessExpired')
                            }
                          />
                        );
                      })()}
                      <UserDetailReadonlyRow
                        label={t('dashboard.users.subscriptionRoom')}
                        value={(() => {
                          if (
                            !subEdit.assignedStudyRoomId ||
                            subEdit.assignedStudyRoomId === '__none__'
                          ) {
                            return t('dashboard.users.subscriptionRoomUnset');
                          }
                          const room = userModalRooms.find(
                            (r) => String(r._id ?? '') === subEdit.assignedStudyRoomId,
                          );
                          if (!room) return subEdit.assignedStudyRoomId;
                          const ne = String(room.nameEn ?? '');
                          const na = String(room.nameAr ?? '');
                          return ne || na || subEdit.assignedStudyRoomId;
                        })()}
                      />
                    </div>
                  </div>
                ) : null}

                {userModal && String(userDetail.role ?? '') === 'student' && adminToken ? (
                  <UserMonthlyAttendanceSection
                    studentId={userModal.id}
                    serverUrl={serverUrl}
                    adminToken={adminToken}
                  />
                ) : null}

                {userModal && String(userDetail.role ?? '') === 'teacher' && adminToken ? (
                  <UserTeacherRatingsSection
                    teacherId={userModal.id}
                    serverUrl={serverUrl}
                    adminToken={adminToken}
                  />
                ) : null}
              </div>
            ) : (
              <>
            {subEdit && String(userDetail.role ?? '') !== 'teacher' ? (
              <div className="border-t border-blue-900/15 bg-blue-50/40 px-1 py-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <p className="mb-1 font-semibold text-text-secondary">
                  {t('dashboard.users.subscriptionSection')}
                </p>
                <p className="mb-4 text-xs text-text-muted">{t('dashboard.users.subscriptionHint')}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('dashboard.users.subscriptionPlan')} className="sm:col-span-2">
                    <Select
                      value={subEdit.signupPlan}
                      onChange={(e) =>
                        setSubEdit((s) => (s ? { ...s, signupPlan: e.target.value } : s))
                      }
                    >
                      {signupQuizSelectOptions(SIGNUP_QUIZ_PLAN, subEdit.signupPlan, t).map((o) => (
                        <option key={o.value || '__unset'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('dashboard.users.subscriptionPaidAt')} className="sm:col-span-2">
                    <Input
                      type="datetime-local"
                      value={subEdit.subscriptionPaidAt}
                      onChange={(e) =>
                        setSubEdit((s) =>
                          s ? { ...s, subscriptionPaidAt: e.target.value } : s,
                        )
                      }
                    />
                    <span className="mt-1 block text-xs text-text-muted">
                      {t('dashboard.users.subscriptionPaidAtHint')}
                    </span>
                  </Field>
                  <Field label={t('dashboard.users.subscriptionEndsAt')} className="sm:col-span-2">
                    <Input
                      type="datetime-local"
                      value={subEdit.subscriptionEndsAt}
                      onChange={(e) =>
                        setSubEdit((s) =>
                          s ? { ...s, subscriptionEndsAt: e.target.value } : s,
                        )
                      }
                    />
                    <span className="mt-1 block text-xs text-text-muted">
                      {t('dashboard.users.subscriptionEndsAtHint')}
                    </span>
                  </Field>
                  {(() => {
                    const subRaw = userDetail.subscription;
                    if (!subRaw || typeof subRaw !== 'object') return null;
                    const active = (subRaw as { accessActive?: boolean }).accessActive;
                    if (active === undefined) return null;
                    return (
                      <p className="sm:col-span-2 text-sm text-text-secondary">
                        <strong>{t('dashboard.users.subscriptionAccessLabel')}:</strong>{' '}
                        {active
                          ? t('dashboard.users.subscriptionAccessActive')
                          : t('dashboard.users.subscriptionAccessExpired')}
                      </p>
                    );
                  })()}
                  <Field label={t('dashboard.users.subscriptionRoom')} className="sm:col-span-2">
                    <Select
                      value={subEdit.assignedStudyRoomId}
                      onChange={(e) =>
                        setSubEdit((s) =>
                          s ? { ...s, assignedStudyRoomId: e.target.value } : s,
                        )
                      }
                    >
                      <option value="__none__">{t('dashboard.users.subscriptionRoomUnset')}</option>
                      {userModalRooms.map((r) => {
                        const id = String(r._id ?? '');
                        const na = String(r.nameAr ?? '');
                        const ne = String(r.nameEn ?? '');
                        if (!id) return null;
                        return (
                          <option key={id} value={id}>
                            {ne || na} ({id.slice(-6)})
                          </option>
                        );
                      })}
                    </Select>
                  </Field>
                </div>
                <div className="mt-4 flex justify-end">
                  <Btn
                    type="button"
                    variant="primary"
                    disabled={subscriptionSaving || !adminToken}
                    onClick={() => void saveSubscription()}
                  >
                    {subscriptionSaving ? t('common.loading') : t('dashboard.users.subscriptionSave')}
                  </Btn>
                </div>
              </div>
            ) : null}

            {signupEdit ? (
              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <p className="mb-1 font-semibold text-text-secondary">{t('dashboard.users.signupSection')}</p>
                <p className="mb-4 text-xs text-text-muted">{t('dashboard.users.signupHint')}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('dashboard.users.signupUserType')}>
                    <Select
                      value={signupEdit.userType}
                      onChange={(e) =>
                        setSignupEdit((s) =>
                          s
                            ? {
                                ...s,
                                userType: e.target.value as AdminSignupDraft['userType'],
                              }
                            : s,
                        )
                      }
                    >
                      <option value="">{t('dashboard.users.signupUserTypeUnset')}</option>
                      <option value={SignupUserType.MALE}>{t('dashboard.users.signupUserTypeMale')}</option>
                      <option value={SignupUserType.FEMALE}>{t('dashboard.users.signupUserTypeFemale')}</option>
                      <option value={SignupUserType.CHILDREN}>{t('dashboard.users.signupUserTypeChildren')}</option>
                    </Select>
                  </Field>
                  <Field label={t('dashboard.users.signupDateOfBirth')}>
                    <Input
                      type="date"
                      value={signupEdit.dateOfBirth}
                      onChange={(e) =>
                        setSignupEdit((s) => (s ? { ...s, dateOfBirth: e.target.value } : s))
                      }
                    />
                  </Field>
                  <Field label={t('dashboard.users.signupLanguageTag')}>
                    <Input
                      value={signupEdit.languageTag}
                      onChange={(e) =>
                        setSignupEdit((s) => (s ? { ...s, languageTag: e.target.value } : s))
                      }
                    />
                  </Field>
                  <Field label={t('dashboard.users.signupPreferredLanguage')}>
                    <Input
                      value={signupEdit.preferredLanguage}
                      onChange={(e) =>
                        setSignupEdit((s) =>
                          s ? { ...s, preferredLanguage: e.target.value } : s,
                        )
                      }
                    />
                  </Field>
                  <Field label={t('dashboard.users.signupNationality')}>
                    <Input
                      value={signupEdit.nationality}
                      onChange={(e) =>
                        setSignupEdit((s) => (s ? { ...s, nationality: e.target.value } : s))
                      }
                    />
                  </Field>
                  <Field label={t('dashboard.users.signupCountryResidence')}>
                    <Input
                      value={signupEdit.countryResidence}
                      onChange={(e) =>
                        setSignupEdit((s) =>
                          s ? { ...s, countryResidence: e.target.value } : s,
                        )
                      }
                    />
                  </Field>
                  <Field label={t('dashboard.users.signupMotherTongue')}>
                    <Input
                      value={signupEdit.motherTongue}
                      onChange={(e) =>
                        setSignupEdit((s) =>
                          s ? { ...s, motherTongue: e.target.value } : s,
                        )
                      }
                    />
                  </Field>
                  {String(userDetail.role ?? '') === 'teacher' ? (
                    <>
                      <Field label={t('dashboard.users.signupOtherLanguages')}>
                        <Select
                          value={signupEdit.otherLanguages}
                          onChange={(e) =>
                            setSignupEdit((s) =>
                              s ? { ...s, otherLanguages: e.target.value } : s,
                            )
                          }
                        >
                          {teacherSelectOptions(
                            TEACHER_LANGUAGE_OPTIONS,
                            signupEdit.otherLanguages,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('dashboard.users.signupAcademicDegree')}>
                        <Select
                          value={signupEdit.academicDegree}
                          onChange={(e) =>
                            setSignupEdit((s) =>
                              s ? { ...s, academicDegree: e.target.value } : s,
                            )
                          }
                        >
                          {teacherSelectOptions(
                            TEACHER_DEGREE_OPTIONS,
                            signupEdit.academicDegree,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('dashboard.users.signupPrimaryIjazat')}>
                        <Select
                          value={signupEdit.primaryIjazat}
                          onChange={(e) =>
                            setSignupEdit((s) =>
                              s ? { ...s, primaryIjazat: e.target.value } : s,
                            )
                          }
                        >
                          {teacherSelectOptions(
                            TEACHER_NARRATION_OPTIONS,
                            signupEdit.primaryIjazat,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        label={t('dashboard.users.signupProficientQiraat')}
                        className="sm:col-span-2"
                      >
                        <CheckboxMultiSelect
                          values={signupEdit.proficientQiraat}
                          onChange={(next) =>
                            setSignupEdit((s) =>
                              s ? { ...s, proficientQiraat: next } : s,
                            )
                          }
                          options={TEACHER_QIRAAT_OPTIONS.map((v) => ({
                            value: v,
                            label: signupTeacherOptionLabel(v, t),
                          }))}
                        />
                      </Field>
                      <Field
                        label={t('dashboard.users.signupIjazatObtained')}
                        className="sm:col-span-2"
                      >
                        <CheckboxMultiSelect
                          values={signupEdit.ijazatObtained}
                          onChange={(next) =>
                            setSignupEdit((s) =>
                              s ? { ...s, ijazatObtained: next } : s,
                            )
                          }
                          options={TEACHER_NARRATION_OPTIONS.map((v) => ({
                            value: v,
                            label: signupTeacherOptionLabel(v, t),
                          }))}
                        />
                      </Field>
                      <Field
                        label={t('dashboard.users.signupApprovedRiwayat')}
                        className="sm:col-span-2"
                      >
                        <CheckboxMultiSelect
                          values={signupEdit.approvedRiwayat}
                          onChange={(next) =>
                            setSignupEdit((s) =>
                              s ? { ...s, approvedRiwayat: next } : s,
                            )
                          }
                          options={TEACHER_NARRATION_OPTIONS.map((v) => ({
                            value: v,
                            label: signupTeacherOptionLabel(v, t),
                          }))}
                        />
                      </Field>
                      <Field
                        label={t('dashboard.users.signupTeachingSciences')}
                        className="sm:col-span-2"
                      >
                        <CheckboxMultiSelect
                          values={signupEdit.teachingSciences}
                          onChange={(next) =>
                            setSignupEdit((s) =>
                              s ? { ...s, teachingSciences: next } : s,
                            )
                          }
                          options={TEACHER_SCIENCE_OPTIONS.map((v) => ({
                            value: v,
                            label: signupTeacherOptionLabel(v, t),
                          }))}
                        />
                      </Field>
                      <Field
                        label={t('dashboard.users.signupAuthorizedBooks')}
                        className="sm:col-span-2"
                      >
                        <TextArea
                          value={signupEdit.authorizedBooks}
                          onChange={(e) =>
                            setSignupEdit((s) =>
                              s ? { ...s, authorizedBooks: e.target.value } : s,
                            )
                          }
                          rows={3}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label={t('dashboard.users.signupMemorizedQuran')}>
                        <Select
                          value={signupEdit.memorizedQuran}
                          onChange={(e) =>
                            setSignupEdit((s) =>
                              s ? { ...s, memorizedQuran: e.target.value } : s,
                            )
                          }
                        >
                          {signupQuizSelectOptions(
                            SIGNUP_QUIZ_MEMORIZED,
                            signupEdit.memorizedQuran,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('dashboard.users.signupAmount')}>
                        <Select
                          value={signupEdit.amount}
                          onChange={(e) =>
                            setSignupEdit((s) => (s ? { ...s, amount: e.target.value } : s))
                          }
                        >
                          {signupQuizSelectOptions(
                            SIGNUP_QUIZ_AMOUNT,
                            signupEdit.amount,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('dashboard.users.signupProgram')}>
                        <Select
                          value={signupEdit.program}
                          onChange={(e) =>
                            setSignupEdit((s) =>
                              s
                                ? {
                                    ...s,
                                    program: e.target.value,
                                    ...(SIGNUP_PROGRAM_SKIPS_AMOUNT_WEEKLY_SURAH.has(
                                      e.target.value,
                                    )
                                      ? { amount: '', weekly: '', surah: '' }
                                      : {}),
                                  }
                                : s,
                            )
                          }
                        >
                          {signupQuizSelectOptions(
                            SIGNUP_QUIZ_PROGRAM,
                            signupEdit.program,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('dashboard.users.signupWeekly')}>
                        <Select
                          value={signupEdit.weekly}
                          onChange={(e) =>
                            setSignupEdit((s) => (s ? { ...s, weekly: e.target.value } : s))
                          }
                        >
                          {signupQuizSelectOptions(
                            SIGNUP_QUIZ_WEEKLY,
                            signupEdit.weekly,
                            t,
                          ).map((o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('dashboard.users.signupSurah')}>
                        <Select
                          value={signupEdit.surah}
                          onChange={(e) =>
                            setSignupEdit((s) => (s ? { ...s, surah: e.target.value } : s))
                          }
                        >
                          {signupQuizSelectOptions(SIGNUP_QUIZ_SURAH, signupEdit.surah, t).map(
                            (o) => (
                              <option key={o.value || '__unset'} value={o.value}>
                                {o.label}
                              </option>
                            ),
                          )}
                        </Select>
                      </Field>
                    </>
                  )}
                  {String(userDetail.role ?? '') !== 'teacher' ? (
                    <Field label={t('dashboard.users.signupPlan')} className="sm:col-span-2">
                      <Select
                        value={signupEdit.signupPlan}
                        onChange={(e) =>
                          setSignupEdit((s) => (s ? { ...s, signupPlan: e.target.value } : s))
                        }
                      >
                        {signupQuizSelectOptions(SIGNUP_QUIZ_PLAN, signupEdit.signupPlan, t).map(
                          (o) => (
                            <option key={o.value || '__unset'} value={o.value}>
                              {o.label}
                            </option>
                          ),
                        )}
                      </Select>
                    </Field>
                  ) : null}
                </div>
                <div className="mt-4 flex justify-end">
                  <Btn
                    type="button"
                    variant="primary"
                    disabled={signupSaving || !adminToken}
                    onClick={() => void saveSignupOptions()}
                  >
                    {signupSaving ? t('common.loading') : t('dashboard.users.signupSave')}
                  </Btn>
                </div>
              </div>
            ) : null}
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!commentModal}
        onClose={() => setCommentModal(null)}
        title={t('dashboard.comments.detailTitle')}
        wide
      >
        {!commentDetail ? (
          <p>{t('common.loading')}</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{String(commentDetail.content ?? '')}</p>
            <Btn variant="danger" onClick={() => void deleteCommentById(String(commentDetail.id))}>
              {t('dashboard.comments.deleteComment')}
            </Btn>
          </div>
        )}
      </Modal>

      <Modal open={sendModal} onClose={closeSendModal} title={t('dashboard.notifications.modalSendTitle')} wide>
        <form onSubmit={(e) => void submitNotification(e)} className="space-y-4">
          {!notifForm.sendToMultiple ? (
            <Field label={t('dashboard.notifications.recipients')}>
              <Input
                placeholder={t('dashboard.notifications.searchRecipients')}
                value={notifRecipientQuery}
                onChange={(e) => setNotifRecipientQuery(e.target.value)}
                className="mb-2"
              />
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  {t('dashboard.notifications.selectedCount', { count: selectedRecipientIds.length })}{' '}
                  <span className="text-text-secondary">{t('dashboard.notifications.pushBadge')}</span>{' '}
                  {t('dashboard.notifications.pushHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Btn
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    disabled={recipientPickerLoading || !recipientPickerUsers.length}
                    onClick={() =>
                      setSelectedRecipientIds(recipientPickerUsers.map((u) => String(u.id)))
                    }
                  >
                    {t('dashboard.notifications.selectAllShown')}
                  </Btn>
                  <Btn
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    disabled={!selectedRecipientIds.length}
                    onClick={() => setSelectedRecipientIds([])}
                  >
                    {t('dashboard.notifications.clearSelection')}
                  </Btn>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {recipientPickerLoading ? (
                  <p className="p-3 text-sm text-text-muted">{t('dashboard.notifications.loadingUsers')}</p>
                ) : recipientPickerUsers.length === 0 ? (
                  <p className="p-3 text-sm text-text-muted">{t('dashboard.notifications.noUsersFound')}</p>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {recipientPickerUsers.map((row) => {
                      const uid = String(row.id);
                      const displayName =
                        `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || t('common.noName');
                      const checked = selectedRecipientIds.includes(uid);
                      const hasPush = pushTokenUserIds.has(uid);
                      return (
                        <li key={uid}>
                          <label
                            className={`flex cursor-pointer gap-3 px-3 py-2.5 text-sm transition-colors ${
                              checked
                                ? 'bg-brand-primary/15 ring-2 ring-inset ring-brand-primary'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/80'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-3 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-primary focus:ring-brand-primary dark:border-gray-500"
                              checked={checked}
                              onChange={() => toggleRecipientId(uid)}
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                              <span className="flex flex-wrap items-center gap-2 font-medium">
                                {displayName}
                                {hasPush ? (
                                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                    {t('dashboard.notifications.pushBadge')}
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-xs text-text-muted">{row.email ?? '—'}</span>
                              <span className="font-mono text-xs text-text-secondary">
                                {t('dashboard.notifications.idPrefix', { id: uid })}
                                {row.role != null && String(row.role).length > 0 ? (
                                  <span className="ml-2 font-sans text-text-muted">
                                    · {String(row.role)}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Field>
          ) : (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-text-secondary dark:border-gray-600 dark:bg-gray-900">
              {t('dashboard.notifications.bulkPushHint', { count: notifUsers.length })}
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={notifForm.sendToMultiple}
              onChange={(e) => {
                const on = e.target.checked;
                setNotifForm((f) => ({
                  ...f,
                  sendToMultiple: on,
                  userId: on ? '' : f.userId,
                }));
                if (on) setSelectedRecipientIds([]);
              }}
            />
            <span>{t('dashboard.notifications.bulkCheckbox')}</span>
          </label>
          <Field label={t('dashboard.notifications.titleField')}>
            <Input
              required
              value={notifForm.title}
              onChange={(e) => setNotifForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.notifications.bodyField')}>
            <TextArea
              required
              rows={4}
              value={notifForm.body}
              onChange={(e) => setNotifForm((f) => ({ ...f, body: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.notifications.typeField')}>
            <Select
              value={notifForm.type}
              onChange={(e) => setNotifForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="general">{t('dashboard.notifications.types.general')}</option>
              <option value="chat">{t('dashboard.notifications.types.chat')}</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={closeSendModal}>
              {t('common.cancel')}
            </Btn>
            <Btn type="submit" variant="primary">
              {t('dashboard.notifications.send')}
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal
        open={sendRoomModal}
        onClose={closeSendRoomModal}
        title={t('dashboard.notifications.sendToRoomTitle')}
        wide
      >
        <form onSubmit={(e) => void submitSendToRoom(e)} className="space-y-4">
          <p className="text-sm text-text-secondary dark:text-gray-300">
            {t('dashboard.notifications.sendToRoomHint')}
          </p>
          <Field label={t('dashboard.notifications.chooseRoom')}>
            <Input
              placeholder={t('dashboard.notifications.searchRooms')}
              value={notifRoomSearch}
              onChange={(e) => setNotifRoomSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              {notifRoomsLoading ? (
                <p className="p-3 text-sm text-text-muted">{t('dashboard.notifications.loadingRooms')}</p>
              ) : filteredNotifRooms.length === 0 ? (
                <p className="p-3 text-sm text-text-muted">{t('dashboard.notifications.noRoomsFound')}</p>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredNotifRooms.map((room) => {
                    const id = entityId(room._id) || entityId(room.id);
                    const selected = selectedNotifRoomId === id;
                    const seats = formatRoomOccupancy(room);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-start text-sm transition-colors ${
                            selected
                              ? 'bg-brand-primary/15 ring-2 ring-inset ring-brand-primary'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/80'
                          }`}
                          onClick={() => void selectNotifRoom(id)}
                        >
                          <span className="font-medium text-text-primary dark:text-gray-100">
                            {roomDisplayName(room)}
                          </span>
                          <span className="text-xs text-text-muted">
                            {t('dashboard.notifications.roomSeats', { seats })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Field>

          {selectedNotifRoomId ? (
            <Field label={t('dashboard.notifications.roomMembers')}>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {roomMembersLoading ? (
                  <p className="p-3 text-sm text-text-muted">
                    {t('dashboard.notifications.loadingRoomMembers')}
                  </p>
                ) : roomNotifyMembers.length === 0 ? (
                  <p className="p-3 text-sm text-text-muted">{t('dashboard.notifications.noRoomMembers')}</p>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {roomNotifyMembers.map((m) => {
                      const hasPush = pushTokenUserIds.has(m.id);
                      return (
                      <li key={m.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-medium text-text-primary dark:text-gray-100">
                            {m.name}
                            {hasPush ? (
                              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                {t('dashboard.notifications.pushBadge')}
                              </span>
                            ) : (
                              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
                                {t('dashboard.notifications.noPushBadge')}
                              </span>
                            )}
                          </span>
                          {m.email ? (
                            <span className="block text-xs text-text-muted">{m.email}</span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                            m.role === 'teacher'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                              : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
                          }`}
                        >
                          {m.role === 'teacher'
                            ? t('dashboard.notifications.roleTeacher')
                            : t('dashboard.notifications.roleStudent')}
                        </span>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {!roomMembersLoading && roomNotifyMembers.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs">
                  <p className="text-text-muted">
                    {t('dashboard.notifications.roomMembersCount', { count: roomNotifyMembers.length })}
                  </p>
                  {roomNotifyMembers.every((m) => !pushTokenUserIds.has(m.id)) ? (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                      {t('dashboard.notifications.roomNoPushTokens')}
                    </p>
                  ) : roomNotifyMembers.some((m) => !pushTokenUserIds.has(m.id)) ? (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                      {t('dashboard.notifications.roomSomeNoPush', {
                        withPush: roomNotifyMembers.filter((m) => pushTokenUserIds.has(m.id)).length,
                        withoutPush: roomNotifyMembers.filter((m) => !pushTokenUserIds.has(m.id)).length,
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Field>
          ) : null}

          <Field label={t('dashboard.notifications.titleField')}>
            <Input
              required
              value={roomNotifForm.title}
              onChange={(e) => setRoomNotifForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.notifications.bodyField')}>
            <TextArea
              required
              rows={4}
              value={roomNotifForm.body}
              onChange={(e) => setRoomNotifForm((f) => ({ ...f, body: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.notifications.typeField')}>
            <Select
              value={roomNotifForm.type}
              onChange={(e) => setRoomNotifForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="general">{t('dashboard.notifications.types.general')}</option>
              <option value="chat">{t('dashboard.notifications.types.chat')}</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={closeSendRoomModal}>
              {t('common.cancel')}
            </Btn>
            <Btn
              type="submit"
              variant="primary"
              disabled={
                sendingRoomNotif ||
                roomMembersLoading ||
                !selectedNotifRoomId ||
                roomNotifyMembers.length === 0
              }
            >
              {sendingRoomNotif
                ? t('common.working')
                : t('dashboard.notifications.sendToRoomMembers', {
                    count: roomNotifyMembers.length,
                  })}
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={sendAllModal} onClose={() => setSendAllModal(false)} title={t('dashboard.notifications.sendAllTitle')}>
        <form onSubmit={(e) => void submitSendToAll(e)} className="space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            {t('dashboard.notifications.sendAllWarning')}
          </div>
          <Field label={t('dashboard.notifications.titleField')}>
            <Input
              required
              value={sendAllForm.title}
              onChange={(e) => setSendAllForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.notifications.bodyField')}>
            <TextArea
              required
              rows={4}
              value={sendAllForm.body}
              onChange={(e) => setSendAllForm((f) => ({ ...f, body: e.target.value }))}
            />
          </Field>
          <Field label={t('dashboard.notifications.typeField')}>
            <Select
              value={sendAllForm.type}
              onChange={(e) => setSendAllForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="general">{t('dashboard.notifications.types.general')}</option>
              <option value="chat">{t('dashboard.notifications.types.chat')}</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={() => setSendAllModal(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn type="submit" variant="warning">
              {t('dashboard.notifications.sendToAll')}
            </Btn>
          </div>
        </form>
      </Modal>

      {message && (
        <MessageBanner
          text={message.text}
          type={message.type}
          onDismiss={() => setMessage(null)}
        />
      )}
    </div>
  );
}
