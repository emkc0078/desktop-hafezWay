import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import {
  playCustomerServiceAlert,
  unlockCustomerServiceAlertAudio,
} from '@/utils/playCustomerServiceAlert';
import { Btn, Card, Input } from '@/components/ui';

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

type ChatMessage = {
  _id: string;
  conversationId?: string;
  senderId?: UserRef | string;
  sender?: UserRef | string;
  content?: string;
  text?: string;
  type?: string;
  createdAt?: string;
  isRead?: boolean;
  read?: boolean;
  readAt?: string | null;
  readBy?: unknown[];
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
    [String((user as { firstName?: string }).firstName ?? '').trim(), String((user as { lastName?: string }).lastName ?? '').trim()]
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
  const markedMessageIds = useRef(new Set<string>());
  const alertedMessageIds = useRef(new Set<string>());
  const alertsPrimed = useRef(false);
  const messageSeededConversations = useRef(new Set<string>());
  const threadEndRef = useRef<HTMLDivElement>(null);

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

  const loadConversations = useCallback(async () => {
    if (!adminToken) return;
    setListLoading((current) => current || conversations.length === 0);
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
      const unread = next.reduce(
        (total, conversation) => total + Math.max(0, Number(conversation.unreadCount) || 0),
        0,
      );
      onUnreadCountChange?.(unread);

      const incomingLastMessageIds = next
        .map((conversation) => {
          const meta = lastMessageMeta(conversation.lastMessage);
          if (!meta.id) return '';
          if (meta.sender && meta.sender === adminUserId) return '';
          // Prefer unread threads; also catch brand-new last messages when sender is known.
          if (Math.max(0, Number(conversation.unreadCount) || 0) > 0 || meta.sender) {
            return meta.id;
          }
          return '';
        })
        .filter(Boolean);
      notifyIncomingMessages(incomingLastMessageIds);
      alertsPrimed.current = true;

      if (selectedId && !next.some((conversation) => conversation._id === selectedId)) {
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
    categoryFilter,
    conversations.length,
    notifyIncomingMessages,
    onUnreadCountChange,
    search,
    selectedId,
    t,
  ]);

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
        setConversations((current) =>
          current.map((conversation) =>
            conversation._id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
          ),
        );
        void loadConversations();
      } catch {
        unreadIds.forEach((id) => markedMessageIds.current.delete(id));
      }
    },
    [adminToken, adminUserId, apiBase, loadConversations],
  );

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

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadConversations(), 250);
    const interval = window.setInterval(() => void loadConversations(), 5000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!active || !selectedId) return;
    void loadMessages();
    const interval = window.setInterval(() => void loadMessages(), 3000);
    return () => window.clearInterval(interval);
  }, [active, loadMessages, selectedId]);

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
      if (sent?._id) setMessages((current) => [...current, sent]);
      await loadMessages();
      void loadConversations();
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <aside
          className={`border-gray-200 dark:border-gray-700 lg:border-e ${
            selectedId ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
              {t('dashboard.customerService.title')}
            </h2>
            <p className="mt-1 text-xs text-text-muted dark:text-gray-400">
              {t('dashboard.customerService.subtitle')}
            </p>
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
                    return (
                      <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                            mine
                              ? 'rounded-ee-sm bg-brand-primary text-white'
                              : 'rounded-es-sm bg-white text-text-primary dark:bg-gray-700 dark:text-gray-100'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {message.content ?? message.text ?? ''}
                          </p>
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

              <form onSubmit={sendMessage} className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
                <Input
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder={t('dashboard.customerService.messagePlaceholder')}
                  disabled={sending}
                  aria-label={t('dashboard.customerService.messagePlaceholder')}
                />
                <Btn type="submit" disabled={sending || !composer.trim()}>
                  {sending ? t('dashboard.customerService.sending') : t('dashboard.customerService.send')}
                </Btn>
              </form>
            </>
          )}
        </section>
      </div>
    </Card>
  );
}
