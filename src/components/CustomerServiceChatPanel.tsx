import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useLocale, useT } from '@/context/LocaleContext';
import { adminFetchFormJson, adminFetchJson } from '@/utils/adminFetch';
import {
  playCustomerServiceAlert,
  unlockCustomerServiceAlertAudio,
} from '@/utils/playCustomerServiceAlert';
import { Btn, Card, Input } from '@/components/ui';
import { ChatVoiceRecordButton, voiceFileName } from '@/components/ChatVoiceRecordButton';

type UserRef = {
  _id?: string;
  id?: string;
  name?: string;
  fullName?: string;
  email?: string;
  role?: string;
  userType?: string;
};

type Conversation = {
  _id: string;
  supportUserId?: UserRef | string;
  supportUser?: UserRef | string;
  supportCategory?: string;
  support?: { category?: string; name?: string };
  name?: string;
  lastMessage?: unknown;
  lastMessageAt?: string;
  unreadCount?: number;
};

type CategoryFilter = 'all' | 'technical' | 'complaint' | 'suggestion';

function conversationCategory(conversation: Conversation): CategoryFilter {
  const raw = String(
    conversation.supportCategory ?? conversation.support?.category ?? 'technical',
  )
    .trim()
    .toLowerCase();
  if (raw === 'complaint' || raw === 'suggestion' || raw === 'technical') return raw;
  return 'technical';
}

function categoryBadgeClass(category: CategoryFilter): string {
  if (category === 'complaint') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  if (category === 'suggestion') return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
}

type MessageAttachment = {
  type?: string;
  url?: string;
  filename?: string;
  size?: number;
  durationMs?: number;
};

type ChatMessage = {
  _id: string;
  conversationId?: string;
  senderId?: UserRef | string;
  sender?: UserRef | string;
  content?: string;
  text?: string;
  type?: string;
  attachments?: MessageAttachment[];
  createdAt?: string;
  isRead?: boolean;
  read?: boolean;
  readAt?: string | null;
  readBy?: unknown[];
  isDeleted?: boolean;
  deletedAt?: string | null;
};

type Props = {
  serverUrl: string;
  adminToken: string;
  adminUserId: string;
  active: boolean;
  onUnreadCountChange?: (count: number) => void;
};

function entityId(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as { _id?: unknown; id?: unknown };
    return entityId(record._id) || entityId(record.id);
  }
  return '';
}

function asUser(value: unknown): UserRef {
  return value && typeof value === 'object' ? (value as UserRef) : {};
}

function userForConversation(conversation: Conversation): UserRef {
  const supportUserId = asUser(conversation.supportUserId);
  return Object.keys(supportUserId).length ? supportUserId : asUser(conversation.supportUser);
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const message = value as { content?: unknown; text?: unknown };
    return String(message.content ?? message.text ?? '');
  }
  return '';
}

function senderId(message: ChatMessage): string {
  return entityId(message.senderId) || entityId(message.sender);
}

function userName(user: UserRef, fallback: string): string {
  return (
    String(user.name ?? user.fullName ?? '').trim() ||
    [
      String((user as { firstName?: string }).firstName ?? '').trim(),
      String((user as { lastName?: string }).lastName ?? '').trim(),
    ]
      .filter(Boolean)
      .join(' ') ||
    String(user.email ?? '') ||
    fallback
  );
}

function lastMessageMeta(value: unknown): { id: string; sender: string } {
  if (!value || typeof value !== 'object') return { id: '', sender: '' };
  const message = value as ChatMessage;
  return {
    id: entityId(message._id),
    sender: senderId(message),
  };
}

function parseAttachments(value: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      type: typeof item.type === 'string' ? item.type : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
      filename: typeof item.filename === 'string' ? item.filename : undefined,
      size: typeof item.size === 'number' ? item.size : undefined,
      durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
    }));
  return rows.length ? rows : undefined;
}

function voiceAttachment(message: ChatMessage): MessageAttachment | null {
  const audio = (message.attachments || []).find(
    (item) => item?.type === 'audio' && Boolean(item.url),
  );
  return audio ?? null;
}

function isVoiceMessage(message: ChatMessage): boolean {
  if (message.isDeleted || message.deletedAt) return false;
  const type = String(message.type || '').toLowerCase();
  return type === 'audio' || Boolean(voiceAttachment(message));
}

function voiceDurationLabel(message: ChatMessage): string {
  const content = String(message.content ?? message.text ?? '').trim();
  if (/^\d+:\d{2}$/.test(content)) return content;
  const ms = voiceAttachment(message)?.durationMs;
  if (typeof ms === 'number' && ms > 0) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  return '0:00';
}

const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000;
type DeleteMessageScope = 'me' | 'everyone';

function canDeleteVoiceForEveryone(message: ChatMessage, mine: boolean): boolean {
  if (!mine || !message.createdAt) return false;
  const created = new Date(message.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created <= DELETE_FOR_EVERYONE_WINDOW_MS;
}

function VoiceMessageBubble({
  message,
  mine,
  label,
  unavailableLabel,
  onRequestDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  label: string;
  unavailableLabel: string;
  onRequestDelete?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const attachment = voiceAttachment(message);
  const url = attachment?.url?.trim() || '';
  const duration = voiceDurationLabel(message);

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = () => {
    if (!onRequestDelete) return;
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      onRequestDelete();
    }, 520);
  };

  useEffect(() => {
    setPlaying(false);
    setFailed(false);
    const node = audioRef.current;
    if (node) {
      node.pause();
      node.currentTime = 0;
    }
  }, [url, message._id]);

  useEffect(() => () => clearLongPress(), []);

  const toggle = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    const node = audioRef.current;
    if (!node || !url || failed) return;
    if (playing) {
      node.pause();
      setPlaying(false);
      return;
    }
    void node.play().then(
      () => setPlaying(true),
      () => setFailed(true),
    );
  };

  const pressHandlers = onRequestDelete
    ? {
        onContextMenu: (event: ReactMouseEvent) => {
          event.preventDefault();
          onRequestDelete();
        },
        onPointerDown: (event: ReactPointerEvent) => {
          if (event.button !== 0) return;
          startLongPress();
        },
        onPointerUp: () => clearLongPress(),
        onPointerLeave: () => clearLongPress(),
        onPointerCancel: () => clearLongPress(),
      }
    : {};

  if (!url || failed) {
    return (
      <div {...pressHandlers} className="select-none">
        <p className={`text-sm ${mine ? 'text-white/90' : 'text-text-secondary dark:text-gray-300'}`}>
          {unavailableLabel}
          {duration !== '0:00' ? ` · ${duration}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div {...pressHandlers} className="flex min-w-[12rem] select-none items-center gap-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onEnded={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          mine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-brand-primary/15 text-brand-primary hover:bg-brand-primary/25 dark:bg-emerald-500/20 dark:text-emerald-300'
        }`}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${mine ? 'text-white' : 'text-text-primary dark:text-gray-100'}`}>
          {label}
        </p>
        <p className={`text-xs ${mine ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>{duration}</p>
      </div>
    </div>
  );
}

function VoiceDeleteSheet({
  open,
  canDeleteForEveryone,
  title,
  forMeLabel,
  forEveryoneLabel,
  forEveryoneHint,
  cancelLabel,
  onClose,
  onChoose,
}: {
  open: boolean;
  canDeleteForEveryone: boolean;
  title: string;
  forMeLabel: string;
  forEveryoneLabel: string;
  forEveryoneHint: string;
  cancelLabel: string;
  onClose: () => void;
  onChoose: (scope: DeleteMessageScope) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-3 text-sm text-text-muted">{title}</p>
        <div className="space-y-2">
          <button
            type="button"
            className="w-full rounded-xl bg-gray-100 px-4 py-3 text-start text-sm font-semibold text-text-primary dark:bg-gray-800 dark:text-gray-100"
            onClick={() => onChoose('me')}
          >
            {forMeLabel}
          </button>
          {canDeleteForEveryone ? (
            <button
              type="button"
              className="w-full rounded-xl bg-red-50 px-4 py-3 text-start text-sm font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300"
              onClick={() => onChoose('everyone')}
            >
              <span className="block">{forEveryoneLabel}</span>
              <span className="mt-1 block text-xs font-medium text-red-600/80 dark:text-red-300/80">
                {forEveryoneHint}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-text-secondary dark:text-gray-300"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeSocketMessage(raw: unknown, conversationId: string): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = entityId(row._id) || entityId(row.id);
  if (!id) return null;
  return {
    _id: id,
    conversationId: String(row.conversationId ?? conversationId),
    senderId: (row.senderId as UserRef | string | undefined) ?? (row.sender as UserRef | string | undefined),
    content: typeof row.content === 'string' ? row.content : undefined,
    text: typeof row.text === 'string' ? row.text : undefined,
    type: typeof row.type === 'string' ? row.type : 'text',
    attachments: parseAttachments(row.attachments),
    createdAt:
      typeof row.createdAt === 'string'
        ? row.createdAt
        : row.createdAt
          ? new Date(row.createdAt as string | number | Date).toISOString()
          : undefined,
    isRead: typeof row.isRead === 'boolean' ? row.isRead : undefined,
    read: typeof row.read === 'boolean' ? row.read : undefined,
    readAt: (row.readAt as string | null | undefined) ?? undefined,
    readBy: Array.isArray(row.readBy) ? row.readBy : undefined,
    isDeleted: typeof row.isDeleted === 'boolean' ? row.isDeleted : undefined,
    deletedAt: (row.deletedAt as string | null | undefined) ?? undefined,
  };
}

export function CustomerServiceChatPanel({
  serverUrl,
  adminToken,
  adminUserId,
  active,
  onUnreadCountChange,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const apiBase = serverUrl.replace(/\/$/, '');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const markedMessageIds = useRef(new Set<string>());
  const alertedMessageIds = useRef(new Set<string>());
  const alertsPrimed = useRef(false);
  const messageSeededConversations = useRef(new Set<string>());
  const threadEndRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedIdRef = useRef('');
  const loadConversationsRef = useRef<() => Promise<void>>(async () => undefined);
  const markIncomingReadRef = useRef<
    | ((
        conversationId: string,
        incoming: ChatMessage[],
        conversationUnreadCount: number,
      ) => Promise<void>)
    | null
  >(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    unlockCustomerServiceAlertAudio();
  }, []);

  const notifyIncomingMessages = useCallback((messageIds: string[]) => {
    const fresh = messageIds.filter((id) => id && !alertedMessageIds.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => alertedMessageIds.current.add(id));
    if (!alertsPrimed.current) return;
    playCustomerServiceAlert();
  }, []);

  const seedIncomingMessages = useCallback((messageIds: string[]) => {
    messageIds.forEach((id) => {
      if (id) alertedMessageIds.current.add(id);
    });
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === selectedId),
    [conversations, selectedId],
  );

  const formatTime = useCallback(
    (value?: string) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
    },
    [locale],
  );

  const bumpUnreadBadge = useCallback(
    (rows: Conversation[]) => {
      const unread = rows.reduce(
        (total, conversation) => total + Math.max(0, Number(conversation.unreadCount) || 0),
        0,
      );
      onUnreadCountChange?.(unread);
    },
    [onUnreadCountChange],
  );

  const applyRealtimeMessage = useCallback(
    (conversationId: string, message: ChatMessage) => {
      if (!conversationId || !message._id) return;
      const fromAdmin = senderId(message) === adminUserId;

      if (!fromAdmin) {
        notifyIncomingMessages([message._id]);
      } else {
        seedIncomingMessages([message._id]);
      }

      if (selectedIdRef.current === conversationId) {
        setMessages((current) => {
          if (current.some((row) => row._id === message._id)) return current;
          return [...current, message];
        });
        if (!fromAdmin) {
          void markIncomingReadRef.current?.(conversationId, [message], 1);
        }
      }

      setConversations((current) => {
        const index = current.findIndex((row) => row._id === conversationId);
        if (index < 0) {
          // Unknown thread (new support chat) — refresh full inbox.
          void loadConversationsRef.current();
          return current;
        }
        const existing = current[index];
        const nextUnread = fromAdmin
          ? Math.max(0, Number(existing.unreadCount) || 0)
          : selectedIdRef.current === conversationId
            ? Math.max(0, Number(existing.unreadCount) || 0)
            : Math.max(0, Number(existing.unreadCount) || 0) + 1;
        const updated: Conversation = {
          ...existing,
          lastMessage: message,
          lastMessageAt: message.createdAt ?? existing.lastMessageAt,
          unreadCount: nextUnread,
        };
        const next = [updated, ...current.filter((_, i) => i !== index)];
        bumpUnreadBadge(next);
        return next;
      });
    },
    [adminUserId, bumpUnreadBadge, notifyIncomingMessages, seedIncomingMessages],
  );

  const loadConversations = useCallback(async () => {
    if (!adminToken) return;
    setListLoading((current) => current || conversationsRef.current.length === 0);
    setListError('');
    try {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      const response = await adminFetchJson<{
        data?: { conversations?: Conversation[] };
        conversations?: Conversation[];
      }>(`${apiBase}/api/chat/support/conversations?${params}`, adminToken);
      const next = response.data?.conversations ?? response.conversations ?? [];
      setConversations(next);
      bumpUnreadBadge(next);

      const incomingLastMessageIds = next
        .map((conversation) => {
          const meta = lastMessageMeta(conversation.lastMessage);
          if (!meta.id) return '';
          if (meta.sender && meta.sender === adminUserId) return '';
          if (Math.max(0, Number(conversation.unreadCount) || 0) > 0 || meta.sender) {
            return meta.id;
          }
          return '';
        })
        .filter(Boolean);
      notifyIncomingMessages(incomingLastMessageIds);
      alertsPrimed.current = true;

      if (selectedIdRef.current && !next.some((conversation) => conversation._id === selectedIdRef.current)) {
        setSelectedId('');
        setMessages([]);
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setListLoading(false);
    }
  }, [
    adminToken,
    adminUserId,
    apiBase,
    bumpUnreadBadge,
    categoryFilter,
    notifyIncomingMessages,
    search,
    t,
  ]);

  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  const markIncomingRead = useCallback(
    async (conversationId: string, incoming: ChatMessage[], conversationUnreadCount: number) => {
      const incomingMessages = incoming.filter(
        (message) => message._id && senderId(message) !== adminUserId,
      );
      const hasMessageReadMetadata = incomingMessages.some(
        (message) =>
          message.isRead !== undefined ||
          message.read !== undefined ||
          message.readAt !== undefined ||
          message.readBy !== undefined,
      );
      const explicitUnread = incomingMessages.filter((message) => {
        const hasReadMetadata =
          message.isRead !== undefined ||
          message.read !== undefined ||
          message.readAt !== undefined ||
          message.readBy !== undefined;
        if (!hasReadMetadata) return false;
        const readByAdmin =
          Array.isArray(message.readBy) &&
          message.readBy.some((reader) => entityId(reader) === adminUserId);
        return !message.isRead && !message.read && !message.readAt && !readByAdmin;
      });
      const candidates =
        hasMessageReadMetadata
          ? explicitUnread
          : incomingMessages.slice(-Math.max(0, conversationUnreadCount));
      const unreadIds = candidates
        .filter((message) => !markedMessageIds.current.has(message._id))
        .map((message) => message._id);
      if (!unreadIds.length) return;
      unreadIds.forEach((id) => markedMessageIds.current.add(id));
      try {
        await adminFetchJson(`${apiBase}/api/chat/messages/mark-read`, adminToken, {
          method: 'PATCH',
          body: JSON.stringify({ conversationId, messageIds: unreadIds }),
        });
        setMessages((current) =>
          current.map((message) =>
            unreadIds.includes(message._id) ? { ...message, isRead: true } : message,
          ),
        );
        setConversations((current) => {
          const next = current.map((conversation) =>
            conversation._id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
          );
          bumpUnreadBadge(next);
          return next;
        });
      } catch {
        unreadIds.forEach((id) => markedMessageIds.current.delete(id));
      }
    },
    [adminToken, adminUserId, apiBase, bumpUnreadBadge],
  );

  useEffect(() => {
    markIncomingReadRef.current = markIncomingRead;
  }, [markIncomingRead]);

  const selectedUnreadCount = Math.max(0, Number(selectedConversation?.unreadCount) || 0);

  const loadMessages = useCallback(async () => {
    if (!adminToken || !selectedId || !active) return;
    setMessagesLoading((current) => current || messages.length === 0);
    setMessagesError('');
    try {
      const response = await adminFetchJson<{
        data?: { messages?: ChatMessage[] };
        messages?: ChatMessage[];
      }>(
        `${apiBase}/api/chat/conversations/${encodeURIComponent(selectedId)}/messages?page=1&limit=100`,
        adminToken,
      );
      const next = response.data?.messages ?? response.messages ?? [];
      setMessages(next);
      const incomingIds = next
        .filter((message) => message._id && senderId(message) !== adminUserId)
        .map((message) => message._id);
      if (!messageSeededConversations.current.has(selectedId)) {
        seedIncomingMessages(incomingIds);
        messageSeededConversations.current.add(selectedId);
      } else {
        notifyIncomingMessages(incomingIds);
      }
      await markIncomingRead(selectedId, next, selectedUnreadCount);
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setMessagesLoading(false);
    }
  }, [
    active,
    adminToken,
    adminUserId,
    apiBase,
    markIncomingRead,
    messages.length,
    notifyIncomingMessages,
    seedIncomingMessages,
    selectedId,
    selectedUnreadCount,
    t,
  ]);

  // Live socket: admins auto-join support:admins on connect.
  useEffect(() => {
    if (!adminToken || !apiBase) return;

    const socket = io(apiBase, {
      transports: ['websocket', 'polling'],
      // Backend handshake expects lowercase "user <token>" then verifies admin JWT.
      auth: { authorization: `user ${adminToken}` },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onNewMessage = (payload: { conversationId?: string; message?: unknown }) => {
      const conversationId = String(payload?.conversationId ?? '').trim();
      const message = normalizeSocketMessage(payload?.message, conversationId);
      if (!conversationId || !message) {
        void loadConversationsRef.current();
        return;
      }
      applyRealtimeMessage(conversationId, message);
    };
    const onMessageDeleted = (payload: {
      conversationId?: string;
      messageId?: string;
      scope?: string;
    }) => {
      const conversationId = String(payload?.conversationId ?? '').trim();
      const messageId = String(payload?.messageId ?? '').trim();
      const scope = String(payload?.scope ?? 'everyone').toLowerCase();
      if (!conversationId || !messageId) return;
      if (selectedIdRef.current === conversationId) {
        setMessages((current) => {
          if (scope === 'me') return current.filter((row) => row._id !== messageId);
          return current.map((row) =>
            row._id === messageId
              ? {
                  ...row,
                  isDeleted: true,
                  deletedAt: new Date().toISOString(),
                  attachments: [],
                  content: 'This message was deleted',
                }
              : row,
          );
        });
      }
      void loadConversationsRef.current();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('chat:newMessage', onNewMessage);
    socket.on('chat:messageSent', onNewMessage);
    socket.on('chat:messageDeleted', onMessageDeleted);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('chat:newMessage', onNewMessage);
      socket.off('chat:messageSent', onNewMessage);
      socket.off('chat:messageDeleted', onMessageDeleted);
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [adminToken, apiBase, applyRealtimeMessage]);

  // Fallback polling (slower when socket is live).
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadConversations(), 150);
    const intervalMs = socketConnected ? 20000 : 4000;
    const interval = window.setInterval(() => void loadConversations(), intervalMs);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadConversations, socketConnected]);

  useEffect(() => {
    if (!active || !selectedId) return;
    void loadMessages();
    const intervalMs = socketConnected ? 15000 : 3000;
    const interval = window.setInterval(() => void loadMessages(), intervalMs);
    return () => window.clearInterval(interval);
  }, [active, loadMessages, selectedId, socketConnected]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const selectConversation = (conversation: Conversation) => {
    setSelectedId(conversation._id);
    setMessages([]);
    setMessagesError('');
    markedMessageIds.current.clear();
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = composer.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    setMessagesError('');
    try {
      const response = await adminFetchJson<ChatMessage | { data?: ChatMessage }>(
        `${apiBase}/api/chat/conversations/${encodeURIComponent(selectedId)}/messages`,
        adminToken,
        { method: 'POST', body: JSON.stringify({ content, type: 'text' }) },
      );
      const sent = 'data' in response && response.data ? response.data : (response as ChatMessage);
      setComposer('');
      if (sent?._id) {
        applyRealtimeMessage(selectedId, {
          ...sent,
          conversationId: selectedId,
        });
      }
      if (!socketConnected) {
        await loadMessages();
        void loadConversations();
      }
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  const formatVoiceDuration = (ms: number) => {
    const total = Math.max(1, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const deleteMessage = useCallback(
    async (message: ChatMessage, scope: DeleteMessageScope) => {
      if (!message._id || deleting) return;
      setDeleting(true);
      setMessagesError('');
      setDeleteTarget(null);
      let snapshot: ChatMessage[] = [];
      setMessages((current) => {
        snapshot = current;
        if (scope === 'me') return current.filter((row) => row._id !== message._id);
        return current.map((row) =>
          row._id === message._id
            ? {
                ...row,
                isDeleted: true,
                deletedAt: new Date().toISOString(),
                attachments: [],
                content: 'This message was deleted',
              }
            : row,
        );
      });
      try {
        await adminFetchJson(
          `${apiBase}/api/chat/messages/${encodeURIComponent(message._id)}?scope=${scope}`,
          adminToken,
          { method: 'DELETE' },
        );
        void loadConversations();
      } catch (error) {
        setMessages(snapshot);
        setMessagesError(
          error instanceof Error ? error.message : t('dashboard.customerService.voiceDeleteFailed'),
        );
      } finally {
        setDeleting(false);
      }
    },
    [adminToken, apiBase, deleting, loadConversations, t],
  );

  const sendVoice = useCallback(
    async (payload: { blob: Blob; durationMs: number; mimeType: string }) => {
      if (!selectedId || sending) return;
      setSending(true);
      setMessagesError('');
      try {
        const form = new FormData();
        form.append(
          'voice',
          payload.blob,
          voiceFileName(payload.mimeType || payload.blob.type || 'audio/webm'),
        );
        form.append('durationMs', String(Math.max(0, Math.floor(payload.durationMs))));
        const uploaded = await adminFetchFormJson<{
          data?: {
            key?: string;
            url?: string;
            filename?: string;
            size?: number;
          };
        }>(
          `${apiBase}/api/chat/conversations/${encodeURIComponent(selectedId)}/voice`,
          adminToken,
          form,
        );
        const data = uploaded.data ?? {};
        const key = String(data.key || '').trim();
        const playUrl = String(data.url || key).trim();
        const filename = String(data.filename || voiceFileName(payload.mimeType)).trim();
        const size = Number(data.size) || payload.blob.size;
        if (!key) {
          throw new Error(t('dashboard.customerService.voiceSendFailed'));
        }
        const content = formatVoiceDuration(payload.durationMs);
        const response = await adminFetchJson<ChatMessage | { data?: ChatMessage }>(
          `${apiBase}/api/chat/conversations/${encodeURIComponent(selectedId)}/messages`,
          adminToken,
          {
            method: 'POST',
            body: JSON.stringify({
              content,
              type: 'audio',
              attachments: [
                {
                  type: 'audio',
                  url: key,
                  filename,
                  size,
                },
              ],
            }),
          },
        );
        const sent = 'data' in response && response.data ? response.data : (response as ChatMessage);
        if (sent?._id) {
          applyRealtimeMessage(selectedId, {
            ...sent,
            conversationId: selectedId,
            type: sent.type || 'audio',
            content: sent.content || content,
            attachments:
              sent.attachments?.length
                ? sent.attachments
                : [{ type: 'audio', url: playUrl || key, filename, size }],
          });
        }
        if (!socketConnected) {
          await loadMessages();
          void loadConversations();
        }
      } catch (error) {
        setMessagesError(
          error instanceof Error ? error.message : t('dashboard.customerService.voiceSendFailed'),
        );
        throw error;
      } finally {
        setSending(false);
      }
    },
    [
      adminToken,
      apiBase,
      applyRealtimeMessage,
      loadConversations,
      loadMessages,
      selectedId,
      sending,
      socketConnected,
      t,
    ],
  );

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <aside
          className={`border-gray-200 dark:border-gray-700 lg:border-e ${
            selectedId ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
                  {t('dashboard.customerService.title')}
                </h2>
                <p className="mt-1 text-xs text-text-muted dark:text-gray-400">
                  {t('dashboard.customerService.subtitle')}
                </p>
              </div>
              <span
                className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  socketConnected
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                }`}
                title={
                  socketConnected
                    ? t('dashboard.customerService.liveOn')
                    : t('dashboard.customerService.liveOff')
                }
              >
                {socketConnected
                  ? t('dashboard.customerService.liveOn')
                  : t('dashboard.customerService.liveOff')}
              </span>
            </div>
            <Input
              className="mt-3"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('dashboard.customerService.search')}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ['all', t('dashboard.customerService.filterAll')],
                  ['complaint', t('dashboard.customerService.filterComplaint')],
                  ['suggestion', t('dashboard.customerService.filterSuggestion')],
                  ['technical', t('dashboard.customerService.filterTechnical')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategoryFilter(id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    categoryFilter === id
                      ? 'bg-brand-primary text-white'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[550px] overflow-y-auto">
            {listLoading && conversations.length === 0 ? (
              <p className="p-5 text-sm text-text-secondary dark:text-gray-300">{t('common.loading')}</p>
            ) : listError && conversations.length === 0 ? (
              <div className="p-5 text-sm text-red-600 dark:text-red-300">
                <p>{listError}</p>
                <Btn className="mt-3" variant="secondary" onClick={() => void loadConversations()}>
                  {t('common.refresh')}
                </Btn>
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-5 text-sm text-text-secondary dark:text-gray-300">
                {t('dashboard.customerService.noConversations')}
              </p>
            ) : (
              conversations.map((conversation) => {
                const user = userForConversation(conversation);
                const unread = Math.max(0, Number(conversation.unreadCount) || 0);
                const category = conversationCategory(conversation);
                const categoryLabel =
                  category === 'complaint'
                    ? t('dashboard.customerService.filterComplaint')
                    : category === 'suggestion'
                      ? t('dashboard.customerService.filterSuggestion')
                      : t('dashboard.customerService.filterTechnical');
                return (
                  <button
                    key={conversation._id}
                    type="button"
                    onClick={() => selectConversation(conversation)}
                    className={`w-full border-b border-gray-100 p-4 text-start transition dark:border-gray-700 ${
                      selectedId === conversation._id
                        ? 'bg-brand-primary/10'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-semibold text-text-primary dark:text-gray-100">
                        {userName(user, t('common.noName'))}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryBadgeClass(category)}`}
                      >
                        {categoryLabel}
                      </span>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {[user.email, user.role ?? user.userType].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-text-secondary dark:text-gray-300">
                        {messageText(conversation.lastMessage) ||
                          t('dashboard.customerService.noMessages')}
                      </p>
                      {unread > 0 && (
                        <span className="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-xs font-semibold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col`}>
          {!selectedConversation ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-text-secondary dark:text-gray-300">
              {t('dashboard.customerService.selectConversation')}
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xl hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
                  onClick={() => setSelectedId('')}
                  aria-label={t('dashboard.customerService.back')}
                >
                  ←
                </button>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-text-primary dark:text-gray-100">
                    {userName(userForConversation(selectedConversation), t('common.noName'))}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryBadgeClass(
                        conversationCategory(selectedConversation),
                      )}`}
                    >
                      {conversationCategory(selectedConversation) === 'complaint'
                        ? t('dashboard.customerService.filterComplaint')
                        : conversationCategory(selectedConversation) === 'suggestion'
                          ? t('dashboard.customerService.filterSuggestion')
                          : t('dashboard.customerService.filterTechnical')}
                    </span>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {[
                        userForConversation(selectedConversation).email,
                        userForConversation(selectedConversation).role ??
                          userForConversation(selectedConversation).userType,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-900/60">
                {messagesLoading && messages.length === 0 ? (
                  <p className="text-center text-sm text-text-secondary dark:text-gray-300">
                    {t('common.loading')}
                  </p>
                ) : messagesError && messages.length === 0 ? (
                  <div className="text-center text-sm text-red-600 dark:text-red-300">
                    <p>{messagesError}</p>
                    <Btn className="mt-3" variant="secondary" onClick={() => void loadMessages()}>
                      {t('common.refresh')}
                    </Btn>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-text-secondary dark:text-gray-300">
                    {t('dashboard.customerService.noMessages')}
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = senderId(message) === adminUserId;
                    const deleted = Boolean(message.isDeleted || message.deletedAt);
                    const voice = !deleted && isVoiceMessage(message);
                    return (
                      <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                            mine
                              ? 'rounded-ee-sm bg-brand-primary text-white'
                              : 'rounded-es-sm bg-white text-text-primary dark:bg-gray-700 dark:text-gray-100'
                          }`}
                        >
                          {deleted ? (
                            <p className={`text-sm italic ${mine ? 'text-white/80' : 'text-text-secondary dark:text-gray-300'}`}>
                              {t('dashboard.customerService.voiceDeleted')}
                            </p>
                          ) : voice ? (
                            <VoiceMessageBubble
                              message={message}
                              mine={mine}
                              label={t('dashboard.customerService.voiceMessage')}
                              unavailableLabel={t('dashboard.customerService.voiceUnavailable')}
                              onRequestDelete={
                                deleting ? undefined : () => setDeleteTarget(message)
                              }
                            />
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {message.content ?? message.text ?? ''}
                            </p>
                          )}
                          <p className={`mt-1 text-xs ${mine ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                {messagesError && messages.length > 0 && (
                  <p className="text-center text-xs text-red-600 dark:text-red-300">{messagesError}</p>
                )}
                <div ref={threadEndRef} />
              </div>

              <form
                onSubmit={sendMessage}
                className="flex flex-wrap items-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700"
              >
                <Input
                  className="min-w-[12rem] flex-1"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder={
                    sending
                      ? t('dashboard.customerService.voiceSending')
                      : t('dashboard.customerService.messagePlaceholder')
                  }
                  disabled={sending}
                  aria-label={t('dashboard.customerService.messagePlaceholder')}
                />
                <ChatVoiceRecordButton
                  disabled={sending || !selectedId}
                  holdLabel={t('dashboard.customerService.voiceHold')}
                  recordingLabel={t('dashboard.customerService.voiceRecording')}
                  unsupportedLabel={t('dashboard.customerService.voiceUnsupported')}
                  micDeniedLabel={t('dashboard.customerService.voiceMicDenied')}
                  onRecorded={sendVoice}
                />
                <Btn type="submit" disabled={sending || !composer.trim()}>
                  {sending ? t('dashboard.customerService.sending') : t('dashboard.customerService.send')}
                </Btn>
              </form>
            </>
          )}
        </section>
      </div>

      <VoiceDeleteSheet
        open={Boolean(deleteTarget)}
        canDeleteForEveryone={
          Boolean(
            deleteTarget &&
              canDeleteVoiceForEveryone(
                deleteTarget,
                senderId(deleteTarget) === adminUserId,
              ),
          )
        }
        title={t('dashboard.customerService.voiceDeleteTitle')}
        forMeLabel={t('dashboard.customerService.voiceDeleteForMe')}
        forEveryoneLabel={t('dashboard.customerService.voiceDeleteForEveryone')}
        forEveryoneHint={t('dashboard.customerService.voiceDeleteForEveryoneHint')}
        cancelLabel={t('common.cancel')}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onChoose={(scope) => {
          if (!deleteTarget) return;
          void deleteMessage(deleteTarget, scope);
        }}
      />
    </Card>
  );
}
