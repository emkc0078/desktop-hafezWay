import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { AdminAuthBar } from '@/components/AdminAuthBar';
import { adminFetchJson } from '@/utils/adminFetch';
import { escapeHtml } from '@/utils/escapeHtml';
import { buildLivekitRoomViewUrl } from '@/utils/livekitRoomUrl';
import {
  StudentReportDetailModal,
  type SessionStudentReportRow,
} from '@/components/StudentReportDetailModal';
import { Btn, Card, Field, Input, MessageBanner, Modal, Select, TableShell, TextArea } from '@/components/ui';

type Tab = 'rooms' | 'users' | 'comments' | 'studentReports' | 'roomRatings' | 'notifications';

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

export function AdminDashboardPage() {
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
        showMessage('Sign in as admin first.', 'error');
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
        showMessage(`Could not open room: ${(e as Error).message}`, 'error');
      }
    },
    [adminToken, adminName, serverUrl, liveAppUrl, showMessage],
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
      showMessage(`Error loading rooms: ${err.message}`, 'error');
    }
  }, [adminToken, serverUrl, pages.rooms, roomSearch, roomTypeFilter, showMessage]);

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
      showMessage(`Error loading users: ${err.message}`, 'error');
    }
  }, [adminToken, serverUrl, pages.users, userSearch, userRole, showMessage]);

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
      showMessage(`Error loading comments: ${err.message}`, 'error');
    }
  }, [adminToken, serverUrl, pages.comments, commentSearch, showMessage]);

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
      showMessage(`Error loading student reports: ${err.message}`, 'error');
    }
  }, [adminToken, serverUrl, pages.studentReports, studentReportSearch, showMessage]);

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
      showMessage(`Error loading room ratings: ${err.message}`, 'error');
    }
  }, [adminToken, serverUrl, pages.roomRatings, roomRatingSearch, showMessage]);

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
      showMessage(`Error loading room: ${(e as Error).message}`, 'error');
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
      showMessage('Arabic name, English name, and room type are required', 'error');
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
        showMessage('Room updated successfully!', 'success');
      } else {
        await adminFetchJson(`${serverUrl}/rooms`, adminToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showMessage('Room created successfully!', 'success');
      }
      setRoomModal(false);
      void loadRooms();
    } catch (err) {
      showMessage(`Error: ${(err as Error).message}`, 'error');
    }
  };

  const [userModal, setUserModal] = useState<{ id: string } | null>(null);
  const [userDetail, setUserDetail] = useState<Record<string, unknown> | null>(null);
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
      showMessage(`Error loading user details: ${(e as Error).message}`, 'error');
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
      showMessage(`Error loading comment details: ${(e as Error).message}`, 'error');
    }
  };

  const deleteCommentById = async (id: string) => {
    if (!adminToken || !confirm('Are you sure you want to delete this comment?')) return;
    try {
      await adminFetchJson(`${serverUrl}/api/comments/${id}`, adminToken, { method: 'DELETE' });
      showMessage('Comment deleted successfully!', 'success');
      setCommentModal(null);
      void loadComments();
    } catch (e) {
      showMessage(`Error: ${(e as Error).message}`, 'error');
    }
  };

  const userAction = async (path: string, method: string) => {
    if (!adminToken) return;
    try {
      await adminFetchJson(`${serverUrl}${path}`, adminToken, { method });
      showMessage('Success', 'success');
      void loadUsers();
    } catch (e) {
      showMessage(`Error: ${(e as Error).message}`, 'error');
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
      showMessage(`Error loading users: ${(e as Error).message}`, 'error');
    } finally {
      setNotifLoading(false);
    }
  }, [adminToken, serverUrl, showMessage]);

  const loadNotificationHistory = useCallback(async () => {
    if (!adminToken) return;
    setNotifLoading(true);
    try {
      const data = await adminFetchJson<{
        data?: { notifications?: unknown[] };
      }>(`${serverUrl}/api/notifications/history`, adminToken);
      setNotifHistory(data.data?.notifications || []);
    } catch (e) {
      showMessage(`Error loading notification history: ${(e as Error).message}`, 'error');
    } finally {
      setNotifLoading(false);
    }
  }, [adminToken, serverUrl, showMessage]);

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
        showMessage(`Error loading user list: ${(e as Error).message}`, 'error');
        setRecipientPickerUsers([]);
      } finally {
        setRecipientPickerLoading(false);
      }
    },
    [adminToken, serverUrl, showMessage],
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
      showMessage('Title and body are required', 'error');
      return;
    }
    try {
      if (sendToMultiple && !userId.trim()) {
        const userIds = notifUsers.map((u) => u.userId);
        if (!userIds.length) {
          showMessage('No users available to send notification to', 'error');
          return;
        }
        await adminFetchJson(`${serverUrl}/api/notifications/send-multiple`, adminToken, {
          method: 'POST',
          body: JSON.stringify({ userIds, title, body, type }),
        });
        showMessage(`Notification sent to ${userIds.length} users successfully!`, 'success');
      } else {
        if (!selectedRecipientIds.length) {
          showMessage('Select at least one recipient', 'error');
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
        } else {
          await adminFetchJson(`${serverUrl}/api/notifications/send-multiple`, adminToken, {
            method: 'POST',
            body: JSON.stringify({ userIds: selectedRecipientIds, title, body, type }),
          });
        }
        showMessage(
          `Notification sent to ${selectedRecipientIds.length} recipient${selectedRecipientIds.length === 1 ? '' : 's'} successfully!`,
          'success',
        );
      }
      closeSendModal();
      void loadUsersWithTokens();
      void loadNotificationHistory();
    } catch (e) {
      showMessage(`Error sending notification: ${(e as Error).message}`, 'error');
    }
  };

  const submitSendToAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const { title, body, type } = sendAllForm;
    if (!title.trim() || !body.trim()) {
      showMessage('Title and body are required', 'error');
      return;
    }
    if (
      !confirm(
        `Are you sure you want to send this notification to ALL users in the database?\n\nTitle: ${title}\nMessage: ${body}\n\nThis action cannot be undone.`,
      )
    )
      return;
    try {
      showMessage('Sending notification to all users... This may take a while.', 'info');
      const response = await adminFetchJson<{
        successCount?: number;
        total?: number;
      }>(`${serverUrl}/api/notifications/send-all`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ title, body, type }),
      });
      showMessage(
        `Notification sent to ${response.successCount ?? 0} out of ${response.total ?? 0} users successfully!`,
        'success',
      );
      setSendAllModal(false);
      void loadUsersWithTokens();
      void loadNotificationHistory();
    } catch (e) {
      showMessage(`Error sending notification: ${(e as Error).message}`, 'error');
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
          Previous
        </Btn>
        <span className="text-sm text-text-muted">
          Page {pagination.page} of {pagination.pages} ({pagination.total} total)
        </span>
        <Btn
          variant="secondary"
          disabled={!pagination.hasNext}
          onClick={() => change(pagination.page + 1)}
        >
          Next
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
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="text-xl font-semibold text-text-primary dark:text-gray-100">Admin Dashboard</h1>
          <div className="min-w-0 flex-1 lg:max-w-xl">
            <AdminAuthBar />
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-950">
        {(
          [
            ['rooms', 'Rooms'],
            ['users', 'Users'],
            ['comments', 'Comments'],
            ['studentReports', 'Student reports'],
            ['roomRatings', 'Room ratings'],
            ['notifications', 'Notifications'],
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
              <h2 className="text-lg font-semibold">Rooms</h2>
              <Btn variant="success" onClick={openCreateRoom}>
                + Create room
              </Btn>
            </div>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder="Search rooms..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                onBlur={() => void loadRooms()}
              />
              <Select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                onBlur={() => void loadRooms()}
              >
                <option value="">All types</option>
                <option value="2">2 persons</option>
                <option value="3">3 persons</option>
                <option value="5">5 persons</option>
                <option value="10">10 persons</option>
              </Select>
              <Btn variant="info" onClick={() => void loadRooms()}>
                Refresh
              </Btn>
            </div>
            {roomsState.loading ? (
              <p className="text-text-muted">Loading…</p>
            ) : roomsState.error ? (
              <p className="text-red-600">{roomsState.error}</p>
            ) : !roomsData?.rooms?.length ? (
              <p className="text-text-muted">No rooms found</p>
            ) : (
              <>
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {['Arabic', 'English', 'Type', 'Cap', 'Participants', 'Created by', 'Status', ''].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-muted"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {roomsData.rooms.map((room) => (
                      <tr key={String(room._id)} className="dark:bg-gray-800/50">
                        <td className="px-3 py-2">{escapeHtml(room.nameAr)}</td>
                        <td className="px-3 py-2">{escapeHtml(room.nameEn)}</td>
                        <td className="px-3 py-2">{String(room.type)} persons</td>
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
                            : 'N/A'}
                        </td>
                        <td className="px-3 py-2">
                          {room.isActive ? (
                            <span className="text-emerald-600">Active</span>
                          ) : (
                            <span className="text-red-600">Inactive</span>
                          )}
                        </td>
                        <td className="space-x-2 px-3 py-2 whitespace-nowrap">
                          <Btn
                            variant="info"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void openLiveKitRoomView(room)}
                          >
                            View
                          </Btn>
                          <Btn
                            variant="warning"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => void editRoom(String(room._id))}
                          >
                            Edit
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
            <h2 className="mb-4 text-lg font-semibold">Users</h2>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onBlur={() => void loadUsers()}
              />
              <Select value={userRole} onChange={(e) => setUserRole(e.target.value)} onBlur={() => void loadUsers()}>
                <option value="">All roles</option>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </Select>
              <Btn variant="info" onClick={() => void loadUsers()}>
                Refresh
              </Btn>
            </div>
            {usersState.loading ? (
              <p className="text-text-muted">Loading…</p>
            ) : usersState.error ? (
              <p className="text-red-600">{usersState.error}</p>
            ) : !usersData?.users?.length ? (
              <p className="text-text-muted">No users found</p>
            ) : (
              <>
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {['Name', 'Email', 'Role', 'Active', 'Frozen', 'Actions'].map((h) => (
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
                        <td className="px-3 py-2">{user.active !== false ? 'Active' : 'Inactive'}</td>
                        <td className="px-3 py-2">{user.isFrozen ? 'Frozen' : 'Not frozen'}</td>
                        <td className="space-x-1 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {user.role !== 'admin' && (
                            <>
                              {user.active !== false ? (
                                <Btn
                                  variant="warning"
                                  className="!px-2 !py-1 text-xs"
                                  onClick={() => {
                                    if (confirm('Deactivate this user?'))
                                      void userAction(`/deactivate/${user.id}`, 'PATCH');
                                  }}
                                >
                                  Deactivate
                                </Btn>
                              ) : (
                                <Btn
                                  variant="success"
                                  className="!px-2 !py-1 text-xs"
                                  onClick={() => void userAction(`/activate/${user.id}`, 'PATCH')}
                                >
                                  Activate
                                </Btn>
                              )}
                            </>
                          )}
                          {!user.isFrozen ? (
                            <Btn
                              variant="warning"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => {
                                if (confirm('Freeze this user?'))
                                  void userAction(`/freeze-account/${user.id}`, 'DELETE');
                              }}
                            >
                              Freeze
                            </Btn>
                          ) : (
                            <Btn
                              variant="success"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void userAction(`/unfreeze-account/${user.id}`, 'PATCH')}
                            >
                              Unfreeze
                            </Btn>
                          )}
                          {user.role !== 'admin' && (
                            <Btn
                              variant="danger"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => {
                                if (confirm('Delete user permanently?'))
                                  void userAction(`/delete-account/${user.id}`, 'DELETE');
                              }}
                            >
                              Delete
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
            <h2 className="mb-4 text-lg font-semibold">Comments</h2>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder="Search comments..."
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                onBlur={() => void loadComments()}
              />
              <Btn variant="info" onClick={() => void loadComments()}>
                Refresh
              </Btn>
            </div>
            {commentsState.loading ? (
              <p className="text-text-muted">Loading…</p>
            ) : commentsState.error ? (
              <p className="text-red-600">{commentsState.error}</p>
            ) : !commentsData?.comments?.length ? (
              <p className="text-text-muted">No comments found</p>
            ) : (
              <>
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {['Content', 'Author', 'Post', 'Created', ''].map((h) => (
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
                            : 'N/A'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.postTitle
                            ? String(c.postTitle)
                            : c.postId
                              ? String(c.postId).slice(0, 8) + '…'
                              : 'N/A'}
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
                            Delete
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
            <h2 className="mb-4 text-lg font-semibold">Student reports (from live rooms)</h2>
            <p className="mb-4 text-sm text-text-muted">
              Teacher-written reports submitted per student in a room. Search matches report text.
            </p>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder="Search report text..."
                value={studentReportSearch}
                onChange={(e) => setStudentReportSearch(e.target.value)}
                onBlur={() => void loadStudentReports()}
              />
              <Btn variant="info" onClick={() => void loadStudentReports()}>
                Refresh
              </Btn>
            </div>
            {studentReportsState.loading ? (
              <p className="text-text-muted">Loading…</p>
            ) : studentReportsState.error ? (
              <p className="text-red-600">{studentReportsState.error}</p>
            ) : !studentReportsData?.reports?.length ? (
              <p className="text-text-muted">No student reports found</p>
            ) : (
              <>
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {['Student', 'Teacher', 'Room', 'Report', 'Date'].map((h) => (
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
            <h2 className="mb-4 text-lg font-semibold">Room ratings</h2>
            <p className="mb-4 text-sm text-text-muted">
              Star ratings (1–5) and optional comments left by students after a session. Search matches
              comment text.
            </p>
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                placeholder="Search comments..."
                value={roomRatingSearch}
                onChange={(e) => setRoomRatingSearch(e.target.value)}
                onBlur={() => void loadRoomRatings()}
              />
              <Btn variant="info" onClick={() => void loadRoomRatings()}>
                Refresh
              </Btn>
            </div>
            {roomRatingsState.loading ? (
              <p className="text-text-muted">Loading…</p>
            ) : roomRatingsState.error ? (
              <p className="text-red-600">{roomRatingsState.error}</p>
            ) : !roomRatingsData?.ratings?.length ? (
              <p className="text-text-muted">No room ratings found</p>
            ) : (
              <>
                <TableShell>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {['Student', 'Room', 'Rating', 'Comment', 'Date'].map((h) => (
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
                          <td className="px-3 py-2 font-medium">{String(row.rating ?? '—')} / 5</td>
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
                <h2 className="text-lg font-semibold">Push notifications</h2>
                <div className="flex flex-wrap gap-2">
                  <Btn variant="success" onClick={() => openSendToUserModal()}>
                    Send to user
                  </Btn>
                  <Btn variant="warning" onClick={() => setSendAllModal(true)}>
                    Send to all
                  </Btn>
                  <Btn variant="info" onClick={() => void loadUsersWithTokens()} disabled={notifLoading}>
                    Refresh users
                  </Btn>
                </div>
              </div>
              {!notifUsers.length ? (
                <p className="text-text-muted">No users with push tokens</p>
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      {['User ID', 'User', 'Email', 'Platforms', 'Tokens', 'Last used', ''].map((h) => (
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
                          {u.user ? `${u.user.firstName ?? ''} ${u.user.lastName ?? ''}`.trim() : 'Unknown'}
                        </td>
                        <td className="px-3 py-2">{u.user?.email ?? ''}</td>
                        <td className="px-3 py-2">{u.platforms?.join(', ')}</td>
                        <td className="px-3 py-2">{u.tokenCount ?? 0}</td>
                        <td className="px-3 py-2 text-xs">
                          {u.lastUsed ? new Date(u.lastUsed).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-3 py-2">
                          <Btn
                            variant="primary"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => openSendToUserModal(u.userId)}
                          >
                            Send
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
                <h2 className="text-lg font-semibold">Notification history</h2>
                <Btn variant="info" onClick={() => void loadNotificationHistory()} disabled={notifLoading}>
                  Refresh
                </Btn>
              </div>
              {!notifHistory.length ? (
                <p className="text-text-muted">No history</p>
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      {['Title', 'Body', 'Type', 'Recipients', 'Success', 'Failed', 'Date'].map((h) => (
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

      <Modal open={roomModal} onClose={() => setRoomModal(false)} title={editingRoomId ? 'Edit room' : 'Create room'}>
        <form onSubmit={(e) => void submitRoom(e)} className="space-y-4">
          <Field label="Arabic name *">
            <Input
              required
              value={roomForm.nameAr}
              onChange={(e) => setRoomForm((f) => ({ ...f, nameAr: e.target.value }))}
            />
          </Field>
          <Field label="English name *">
            <Input
              required
              value={roomForm.nameEn}
              onChange={(e) => setRoomForm((f) => ({ ...f, nameEn: e.target.value }))}
            />
          </Field>
          <Field label="Description">
            <TextArea
              rows={3}
              value={roomForm.description}
              onChange={(e) => setRoomForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label="Room type *">
            <Select
              required
              value={roomForm.type}
              onChange={(e) => setRoomForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="">Select</option>
              <option value="2">2 persons</option>
              <option value="3">3 persons</option>
              <option value="5">5 persons</option>
              <option value="10">10 persons</option>
            </Select>
          </Field>
          <Field label="Participant user IDs (comma-separated)">
            <Input
              value={roomForm.participants}
              onChange={(e) => setRoomForm((f) => ({ ...f, participants: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" type="button" onClick={() => setRoomModal(false)}>
              Cancel
            </Btn>
            <Btn variant="primary" type="submit">
              Save
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={!!userModal} onClose={() => setUserModal(null)} title="User details" wide>
        {!userDetail ? (
          <p>Loading…</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Name:</strong> {String(userDetail.firstName)} {String(userDetail.lastName)}
            </p>
            <p>
              <strong>Email:</strong> {String(userDetail.email ?? '')}
            </p>
            <p>
              <strong>Role:</strong> {String(userDetail.role ?? '')}
            </p>
            <p>
              <strong>Phone:</strong> {String(userDetail.phone ?? '')}
            </p>
            <p>
              <strong>Created:</strong>{' '}
              {userDetail.createdAt ? new Date(String(userDetail.createdAt)).toLocaleString() : ''}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!commentModal}
        onClose={() => setCommentModal(null)}
        title="Comment details"
        wide
      >
        {!commentDetail ? (
          <p>Loading…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{String(commentDetail.content ?? '')}</p>
            <Btn variant="danger" onClick={() => void deleteCommentById(String(commentDetail.id))}>
              Delete comment
            </Btn>
          </div>
        )}
      </Modal>

      <Modal open={sendModal} onClose={closeSendModal} title="Send notification" wide>
        <form onSubmit={(e) => void submitNotification(e)} className="space-y-4">
          {!notifForm.sendToMultiple ? (
            <Field label="Recipients *">
              <Input
                placeholder="Search by name, email, or user ID…"
                value={notifRecipientQuery}
                onChange={(e) => setNotifRecipientQuery(e.target.value)}
                className="mb-2"
              />
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  <strong>{selectedRecipientIds.length}</strong> selected · up to 200 per search ·{' '}
                  <span className="text-text-secondary">Push</span> = device registered for push.
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
                    Select all shown
                  </Btn>
                  <Btn
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    disabled={!selectedRecipientIds.length}
                    onClick={() => setSelectedRecipientIds([])}
                  >
                    Clear selection
                  </Btn>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {recipientPickerLoading ? (
                  <p className="p-3 text-sm text-text-muted">Loading users…</p>
                ) : recipientPickerUsers.length === 0 ? (
                  <p className="p-3 text-sm text-text-muted">
                    No users found. Try another search or check the Users tab.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {recipientPickerUsers.map((row) => {
                      const uid = String(row.id);
                      const displayName =
                        `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || '(No name)';
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
                                    Push
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-xs text-text-muted">{row.email ?? '—'}</span>
                              <span className="font-mono text-xs text-text-secondary">
                                ID: {uid}
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
              Sends to{' '}
              <strong>{notifUsers.length}</strong> user{notifUsers.length === 1 ? '' : 's'} who have push
              tokens (no recipient pick).
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
            <span>
              Send to <strong>all</strong> users with push tokens (bulk — hides the checklist above)
            </span>
          </label>
          <Field label="Title *">
            <Input
              required
              value={notifForm.title}
              onChange={(e) => setNotifForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <Field label="Body *">
            <TextArea
              required
              rows={4}
              value={notifForm.body}
              onChange={(e) => setNotifForm((f) => ({ ...f, body: e.target.value }))}
            />
          </Field>
          <Field label="Type">
            <Select
              value={notifForm.type}
              onChange={(e) => setNotifForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="general">General</option>
              <option value="chat">Chat</option>
              <option value="auction">Auction</option>
              <option value="order">Order</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={closeSendModal}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary">
              Send
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={sendAllModal} onClose={() => setSendAllModal(false)} title="Send to all users">
        <form onSubmit={(e) => void submitSendToAll(e)} className="space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            This sends to all users in the database. This cannot be undone.
          </div>
          <Field label="Title *">
            <Input
              required
              value={sendAllForm.title}
              onChange={(e) => setSendAllForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <Field label="Body *">
            <TextArea
              required
              rows={4}
              value={sendAllForm.body}
              onChange={(e) => setSendAllForm((f) => ({ ...f, body: e.target.value }))}
            />
          </Field>
          <Field label="Type">
            <Select
              value={sendAllForm.type}
              onChange={(e) => setSendAllForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="general">General</option>
              <option value="chat">Chat</option>
              <option value="auction">Auction</option>
              <option value="order">Order</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={() => setSendAllModal(false)}>
              Cancel
            </Btn>
            <Btn type="submit" variant="warning">
              Send to all
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
