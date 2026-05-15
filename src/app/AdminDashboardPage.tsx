import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { AdminAuthBar } from '@/components/AdminAuthBar';
import { adminFetchJson } from '@/utils/adminFetch';
import { escapeHtml } from '@/utils/escapeHtml';
import { buildLivekitRoomViewUrl } from '@/utils/livekitRoomUrl';
import {
  StudentReportDetailModal,
  type SessionStudentReportRow,
} from '@/components/StudentReportDetailModal';
import { Btn, Card, Field, Input, MessageBanner, Modal, Select, TableShell, TextArea } from '@/components/ui';
import {
  SIGNUP_PROGRAM_SKIPS_AMOUNT_WEEKLY_SURAH,
  SIGNUP_QUIZ_AMOUNT,
  SIGNUP_QUIZ_MEMORIZED,
  SIGNUP_QUIZ_PLAN,
  SIGNUP_QUIZ_PROGRAM,
  SIGNUP_QUIZ_SURAH,
  SIGNUP_QUIZ_WEEKLY,
} from '@/constants/signupQuizOptions';

type Tab =
  | 'rooms'
  | 'users'
  | 'comments'
  | 'studentReports'
  | 'roomRatings'
  | 'notifications';

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
  userType: '' | 'male' | 'female' | 'children';
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
};

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
  let userType: AdminSignupDraft['userType'] = '';
  const utRaw = nested.userType !== undefined ? nested.userType : detail.userType;
  if (utRaw === 'male' || utRaw === 'female' || utRaw === 'children') {
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
  };
}

/** Label for stored quiz key; falls back to raw value if unknown. */
function signupQuizOptionLabel(val: string, t: (key: string) => string): string {
  if (!val) return '';
  const path = `dashboard.users.signupQuizVals.${val}`;
  const lbl = t(path);
  return lbl === path ? val : lbl;
}

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

export function AdminDashboardPage() {
  const t = useT();
  const { serverUrl, liveAppUrl, adminToken, adminName } = useAdminSettings();

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
    setRoomsState({ loading: true });
    try {
      let url = `${serverUrl}/rooms?page=${pages.rooms}&limit=20`;
      if (roomSearch) url += `&search=${encodeURIComponent(roomSearch)}`;
      if (roomTypeFilter) url += `&type=${roomTypeFilter}`;
      const data = await adminFetchJson<{ data?: unknown } | Record<string, unknown>>(url, adminToken);
      const roomsData = 'data' in data && data.data !== undefined ? data.data : data;
      setRoomsState({ loading: false, data: roomsData });
    } catch (e) {
      const err = e as Error;
      setRoomsState({ loading: false, error: err.message });
      showMessage(t('dashboard.rooms.loadError', { message: err.message }), 'error');
    }
  }, [adminToken, serverUrl, pages.rooms, roomSearch, roomTypeFilter, showMessage, t]);

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
  });

  const openCreateRoom = () => {
    setEditingRoomId(null);
    setRoomForm({ nameAr: '', nameEn: '', description: '', type: '', participants: '' });
    setRoomModal(true);
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
      setRoomForm({
        nameAr: String(room.nameAr ?? ''),
        nameEn: String(room.nameEn ?? ''),
        description: String(room.description ?? ''),
        type: String(room.type ?? ''),
        participants: '',
      });
      setRoomModal(true);
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
    try {
      const body = {
        nameAr,
        nameEn,
        description: description || undefined,
        type,
        participantIds: participantIds.length ? participantIds : undefined,
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
      showMessage(t('dashboard.genericError', { message: (err as Error).message }), 'error');
    }
  };

  const [userModal, setUserModal] = useState<{ id: string } | null>(null);
  const [userDetail, setUserDetail] = useState<Record<string, unknown> | null>(null);
  const [signupEdit, setSignupEdit] = useState<AdminSignupDraft | null>(null);
  const [signupSaving, setSignupSaving] = useState(false);
  const [commentModal, setCommentModal] = useState<{ id: string } | null>(null);
  const [commentDetail, setCommentDetail] = useState<Record<string, unknown> | null>(null);

  const openUser = async (userId: string) => {
    if (!adminToken) return;
    setUserModal({ id: userId });
    setUserDetail(null);
    try {
      const data = await adminFetchJson<{ data: { user: Record<string, unknown> } }>(
        `${serverUrl}/getById/${userId}`,
        adminToken,
      );
      setUserDetail(data.data.user);
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

  const saveSignupOptions = async () => {
    if (!adminToken || !userModal || !signupEdit) return;
    const trimOrNull = (s: string) => {
      const v = s.trim();
      return v === '' ? null : v;
    };
    const dobRaw = signupEdit.dateOfBirth.trim();
    const body: Record<string, unknown> = {
      userType: signupEdit.userType === '' ? null : signupEdit.userType,
      languageTag: trimOrNull(signupEdit.languageTag),
      preferredLanguage: trimOrNull(signupEdit.preferredLanguage),
      nationality: trimOrNull(signupEdit.nationality),
      countryResidence: trimOrNull(signupEdit.countryResidence),
      motherTongue: trimOrNull(signupEdit.motherTongue),
      dateOfBirth: dobRaw === '' ? null : dobRaw,
      memorizedQuran: trimOrNull(signupEdit.memorizedQuran),
      amount: trimOrNull(signupEdit.amount),
      program: trimOrNull(signupEdit.program),
      weekly: trimOrNull(signupEdit.weekly),
      surah: trimOrNull(signupEdit.surah),
      signupPlan: trimOrNull(signupEdit.signupPlan),
    };
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
    } catch (e) {
      showMessage(
        t('dashboard.users.signupSaveError', { message: (e as Error).message }),
        'error',
      );
    } finally {
      setSignupSaving(false);
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
      showMessage(t('dashboard.genericError', { message: (e as Error).message }), 'error');
    }
  };

  const userAction = async (path: string, method: string) => {
    if (!adminToken) return;
    try {
      await adminFetchJson(`${serverUrl}${path}`, adminToken, { method });
      showMessage(t('common.success'), 'success');
      void loadUsers();
    } catch (e) {
      showMessage(t('dashboard.genericError', { message: (e as Error).message }), 'error');
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
  const [notifRecipientQuery, setNotifRecipientQuery] = useState('');
  const [notifForm, setNotifForm] = useState({
    userId: '',
    title: '',
    body: '',
    type: 'general',
    sendToMultiple: false,
  });
  const [sendAllForm, setSendAllForm] = useState({ title: '', body: '', type: 'general' });

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

  const openSendToUserModal = useCallback((presetUserId?: string) => {
    setNotifForm((f) => ({
      ...f,
      sendToMultiple: false,
      userId: '',
    }));
    setSelectedRecipientIds(presetUserId !== undefined ? [presetUserId] : []);
    setNotifRecipientQuery('');
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

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="shrink-0 text-xl font-semibold text-text-primary dark:text-gray-100">
            {t('dashboard.title')}
          </h1>
          <div className="min-w-0 w-full lg:max-w-5xl lg:flex-1">
            <AdminAuthBar />
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-950">
        {(
          [
            ['rooms', t('dashboard.tabs.rooms')],
            ['users', t('dashboard.tabs.users')],
            ['comments', t('dashboard.tabs.comments')],
            ['studentReports', t('dashboard.tabs.studentReports')],
            ['roomRatings', t('dashboard.tabs.roomRatings')],
            ['notifications', t('dashboard.tabs.notifications')],
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

      <main className="mx-auto max-w-7xl space-y-6 p-6">
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
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {[
                        t('dashboard.rooms.cols.arabic'),
                        t('dashboard.rooms.cols.english'),
                        t('dashboard.rooms.cols.type'),
                        t('dashboard.rooms.cols.cap'),
                        t('dashboard.rooms.cols.participants'),
                        t('dashboard.rooms.cols.createdBy'),
                        t('dashboard.rooms.cols.status'),
                        '',
                      ].map((h) => (
                          <th
                            key={h || 'actions'}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted"
                          >
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {roomsData.rooms.map((room) => (
                      <tr key={String(room._id)} className="dark:bg-gray-800/50">
                        <td className="px-3 py-2">{escapeHtml(room.nameAr)}</td>
                        <td className="px-3 py-2">{escapeHtml(room.nameEn)}</td>
                        <td className="px-3 py-2">
                          {t('dashboard.rooms.persons', { count: Number(room.type) })}
                        </td>
                        <td className="px-3 py-2">{String(room.capacity)}</td>
                        <td className="px-3 py-2">
                          {Array.isArray(room.participants) ? room.participants.length : 0}/
                          {String(room.capacity)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {room.createdBy &&
                          typeof room.createdBy === 'object' &&
                          room.createdBy !== null
                            ? `${(room.createdBy as { firstName?: string }).firstName ?? ''} ${(room.createdBy as { lastName?: string }).lastName ?? ''}`
                            : t('common.na')}
                        </td>
                        <td className="px-3 py-2">
                          {room.isActive ? (
                            <span className="text-emerald-600">{t('dashboard.rooms.active')}</span>
                          ) : (
                            <span className="text-red-600">{t('dashboard.rooms.inactive')}</span>
                          )}
                        </td>
                        <td className="space-x-2 px-3 py-2 whitespace-nowrap">
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
          <Card>
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
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {[
                        t('dashboard.users.cols.name'),
                        t('dashboard.users.cols.email'),
                        t('dashboard.users.cols.role'),
                        t('dashboard.users.cols.active'),
                        t('dashboard.users.cols.frozen'),
                        t('dashboard.users.cols.actions'),
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {usersData.users.map((user) => (
                      <tr
                        key={String(user.id)}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => void openUser(String(user.id))}
                      >
                        <td className="px-3 py-2">
                          {escapeHtml(user.firstName)} {escapeHtml(user.lastName)}
                        </td>
                        <td className="px-3 py-2">{escapeHtml(user.email)}</td>
                        <td className="px-3 py-2">{escapeHtml(user.role)}</td>
                        <td className="px-3 py-2">
                          {user.active !== false ? t('dashboard.users.active') : t('dashboard.users.inactive')}
                        </td>
                        <td className="px-3 py-2">
                          {user.isFrozen ? t('dashboard.users.frozen') : t('dashboard.users.notFrozen')}
                        </td>
                        <td className="space-x-1 px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                          {!user.isFrozen ? (
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
                <TableShell>
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
                          className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted"
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
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
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
                          className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
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
                          className="cursor-pointer hover:bg-gray-50 dark:bg-gray-800/50 dark:hover:bg-gray-800"
                          onClick={() => setSelectedSessionReport(row as SessionStudentReportRow)}
                        >
                          <td className="max-w-[10rem] px-3 py-2 text-sm">
                            <div>{escapeHtml(name(student))}</div>
                            {student?.email ? (
                              <div className="text-xs text-text-muted">{escapeHtml(String(student.email))}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-sm">{escapeHtml(name(teacher))}</td>
                          <td className="max-w-[12rem] px-3 py-2 text-sm">
                            {room?.nameEn || room?.nameAr
                              ? escapeHtml(String(room.nameEn ?? room.nameAr))
                              : '—'}
                          </td>
                          <td
                            className="max-w-xl px-3 py-2 text-sm whitespace-pre-wrap"
                            title={fullReport.length > 140 ? fullReport : undefined}
                          >
                            {preview || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
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
                <TableShell>
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
                          className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted"
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
                          <td className="max-w-[10rem] px-3 py-2 text-sm">
                            <div>{escapeHtml(name(student))}</div>
                            {student?.email ? (
                              <div className="text-xs text-text-muted">{escapeHtml(String(student.email))}</div>
                            ) : null}
                          </td>
                          <td className="max-w-[12rem] px-3 py-2 text-sm">
                            {room?.nameEn || room?.nameAr
                              ? escapeHtml(String(room.nameEn ?? room.nameAr))
                              : '—'}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {t('dashboard.roomRatings.ratingOf', { rating: String(row.rating ?? '—') })}
                          </td>
                          <td className="max-w-xl px-3 py-2 text-sm whitespace-pre-wrap">
                            {row.comment ? escapeHtml(String(row.comment)) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
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
                  <Btn variant="warning" onClick={() => setSendAllModal(true)}>
                    {t('dashboard.notifications.sendToAll')}
                  </Btn>
                  <Btn variant="info" onClick={() => void loadUsersWithTokens()} disabled={notifLoading}>
                    {t('dashboard.notifications.refreshUsers')}
                  </Btn>
                </div>
              </div>
              {!notifUsers.length ? (
                <p className="text-text-muted">{t('dashboard.notifications.noPushUsers')}</p>
              ) : (
                <TableShell>
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
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-text-muted">
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
                <TableShell>
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
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-text-muted">
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
                          <td className="px-3 py-2">{String(row.totalRecipients ?? '')}</td>
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
            </div>

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
                      <option value="male">{t('dashboard.users.signupUserTypeMale')}</option>
                      <option value="female">{t('dashboard.users.signupUserTypeFemale')}</option>
                      <option value="children">{t('dashboard.users.signupUserTypeChildren')}</option>
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
                  <Field label={t('dashboard.users.signupMemorizedQuran')}>
                    <Select
                      value={signupEdit.memorizedQuran}
                      onChange={(e) =>
                        setSignupEdit((s) =>
                          s ? { ...s, memorizedQuran: e.target.value } : s,
                        )
                      }
                    >
                      {signupQuizSelectOptions(SIGNUP_QUIZ_MEMORIZED, signupEdit.memorizedQuran, t).map((o) => (
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
                      {signupQuizSelectOptions(SIGNUP_QUIZ_AMOUNT, signupEdit.amount, t).map((o) => (
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
                                ...(SIGNUP_PROGRAM_SKIPS_AMOUNT_WEEKLY_SURAH.has(e.target.value)
                                  ? { amount: '', weekly: '', surah: '' }
                                  : {}),
                              }
                            : s,
                        )
                      }
                    >
                      {signupQuizSelectOptions(SIGNUP_QUIZ_PROGRAM, signupEdit.program, t).map((o) => (
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
                      {signupQuizSelectOptions(SIGNUP_QUIZ_WEEKLY, signupEdit.weekly, t).map((o) => (
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
                      {signupQuizSelectOptions(SIGNUP_QUIZ_SURAH, signupEdit.surah, t).map((o) => (
                        <option key={o.value || '__unset'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('dashboard.users.signupPlan')} className="sm:col-span-2">
                    <Select
                      value={signupEdit.signupPlan}
                      onChange={(e) =>
                        setSignupEdit((s) => (s ? { ...s, signupPlan: e.target.value } : s))
                      }
                    >
                      {signupQuizSelectOptions(SIGNUP_QUIZ_PLAN, signupEdit.signupPlan, t).map((o) => (
                        <option key={o.value || '__unset'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
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
              <option value="auction">{t('dashboard.notifications.types.auction')}</option>
              <option value="order">{t('dashboard.notifications.types.order')}</option>
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
              <option value="auction">{t('dashboard.notifications.types.auction')}</option>
              <option value="order">{t('dashboard.notifications.types.order')}</option>
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
