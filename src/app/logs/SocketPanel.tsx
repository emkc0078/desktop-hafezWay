import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import {
  Btn,
  Card,
  Field,
  Input,
  MessageBanner,
  TextArea,
} from '@/components/ui';

type ConnStatus = 'disconnected' | 'connecting' | 'connected';

type LogEntry = {
  id: number;
  ts: string;
  text: string;
  kind: 'info' | 'success' | 'error';
};

let logId = 0;

export function SocketPanel() {
  const t = useT();
  const { serverUrl } = useAdminSettings();
  const socketRef = useRef<Socket | null>(null);

  const [token, setToken] = useState('');
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [testMessage, setTestMessage] = useState('Hello from admin panel');
  const [privateMessage, setPrivateMessage] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [groupMessage, setGroupMessage] = useState('');
  const [groupId, setGroupId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );

  const appendLog = useCallback((text: string, kind: LogEntry['kind'] = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { id: ++logId, ts, text, kind }]);
  }, []);

  const teardownSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      appendLog(t('socket.connected'), 'info');
      return;
    }

    teardownSocket();
    setStatus('connecting');
    appendLog(t('socket.connecting'));

    const authToken = token.trim();
    const socket = io(serverUrl.replace(/\/$/, ''), {
      transports: ['websocket', 'polling'],
      auth: { authorization: authToken ? `USER ${authToken}` : '' },
    });

    socket.on('connect', () => {
      setStatus('connected');
      appendLog(`${t('socket.connected')} — ${socket.id}`, 'success');
    });

    socket.on('disconnect', (reason) => {
      setStatus('disconnected');
      appendLog(`${t('socket.disconnected')}: ${reason}`, 'error');
    });

    socket.on('connect_error', (error: Error) => {
      setStatus('disconnected');
      appendLog(`${t('socket.disconnected')}: ${error.message}`, 'error');
    });

    socket.on('custom_error', (error: { message?: string }) => {
      appendLog(`custom_error: ${error?.message ?? t('common.unknown')}`, 'error');
    });

    socket.on('newMessage', (data: { content?: string; createdBy?: { username?: string } }) => {
      const from = data.createdBy?.username ?? t('common.unknown');
      appendLog(`newMessage — ${from}: ${data.content ?? ''}`, 'success');
    });

    socket.on('successMessage', (data: { content?: string }) => {
      appendLog(`successMessage: ${data.content ?? ''}`, 'success');
    });

    socket.on('userConnected', (data: { userId?: string; username?: string }) => {
      appendLog(`userConnected — ${data.username ?? '?'} (${data.userId ?? '?'})`, 'info');
    });

    socket.on('userDisconnected', (data: { userId?: string; username?: string }) => {
      appendLog(`userDisconnected — ${data.username ?? '?'} (${data.userId ?? '?'})`, 'info');
    });

    socketRef.current = socket;
  }, [appendLog, serverUrl, t, teardownSocket, token]);

  const disconnect = useCallback(() => {
    teardownSocket();
    appendLog(t('socket.disconnected'), 'info');
  }, [appendLog, t, teardownSocket]);

  useEffect(() => () => teardownSocket(), [teardownSocket]);

  const requireConnected = (): boolean => {
    if (socketRef.current?.connected) return true;
    appendLog(t('socket.notConnected'), 'error');
    setBanner({ type: 'error', text: t('socket.notConnected') });
    return false;
  };

  const sendTest = () => {
    if (!requireConnected()) return;
    appendLog(`${t('socket.sendTest')}: ${testMessage}`);
    socketRef.current!.emit('sayHi', testMessage, (response: unknown) => {
      appendLog(`${t('socket.sayHi')} ack: ${JSON.stringify(response)}`, 'success');
    });
  };

  const sendPrivate = () => {
    if (!requireConnected()) return;
    if (!privateMessage.trim() || !recipientId.trim()) {
      setBanner({ type: 'error', text: t('socket.needMessageRecipient') });
      return;
    }
    appendLog(`${t('socket.sendMessagePrivate')} → ${recipientId.trim()}`);
    socketRef.current!.emit('sendMessage', {
      content: privateMessage.trim(),
      sendTo: recipientId.trim(),
    });
  };

  const sendGroup = () => {
    if (!requireConnected()) return;
    if (!groupMessage.trim() || !groupId.trim()) {
      setBanner({ type: 'error', text: t('socket.needMessageGroup') });
      return;
    }
    appendLog(`${t('socket.sendGroupMessage')} → ${groupId.trim()}`);
    socketRef.current!.emit('sendGroupMessage', {
      content: groupMessage.trim(),
      groupId: groupId.trim(),
    });
  };

  const joinRoom = () => {
    if (!requireConnected()) return;
    if (!roomId.trim()) {
      setBanner({ type: 'error', text: t('socket.needRoomId') });
      return;
    }
    appendLog(`${t('socket.joinRoomBtn')}: ${roomId.trim()}`);
    socketRef.current!.emit('join_room', { roomId: roomId.trim() });
  };

  const leaveRoom = () => {
    if (!requireConnected()) return;
    if (!roomId.trim()) {
      setBanner({ type: 'error', text: t('socket.needRoomId') });
      return;
    }
    const rid = roomId.trim();
    appendLog(`${t('socket.leaveRoom')}: ${rid}`);
    socketRef.current!.emit('leave_room', { roomId: rid });
  };

  const clearLog = () => setLogs([]);

  const statusLabel =
    status === 'connected'
      ? t('socket.connected')
      : status === 'connecting'
        ? t('socket.connecting')
        : t('socket.disconnected');

  const statusClass =
    status === 'connected'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'connecting'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';

  const listenedEvents = [
    'connect',
    'disconnect',
    'connect_error',
    'custom_error',
    'newMessage',
    'successMessage',
    'userConnected',
    'userDisconnected',
  ];

  return (
    <div className="space-y-6">
      {banner ? (
        <MessageBanner
          type={banner.type}
          text={banner.text}
          onDismiss={() => setBanner(null)}
        />
      ) : null}

      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('socket.title')}</h2>
        <p className="mb-4 text-sm text-text-secondary dark:text-gray-300">
          {t('socket.server')}{' '}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-900">
            {serverUrl.replace(/\/$/, '')}
          </code>
        </p>

        <div className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${statusClass}`}>
          {statusLabel}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field label={t('socket.token')}>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('socket.pasteToken')}
            />
          </Field>
          <Btn
            variant="success"
            onClick={connect}
            disabled={status === 'connecting'}
          >
            {t('socket.connect')}
          </Btn>
          <Btn variant="secondary" onClick={disconnect} disabled={status === 'disconnected'}>
            {t('socket.disconnect')}
          </Btn>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-base font-semibold">{t('socket.testMessage')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('socket.testMessage')} className="min-w-[200px] flex-1">
            <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          </Field>
          <Btn variant="info" onClick={sendTest}>
            {t('socket.sendTest')} ({t('socket.sayHi')})
          </Btn>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold">{t('socket.sendMessagePrivate')}</h3>
          <div className="space-y-3">
            <Field label={t('socket.privateTo')}>
              <Input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} />
            </Field>
            <Field label={t('socket.privateMessage')}>
              <TextArea
                rows={2}
                value={privateMessage}
                onChange={(e) => setPrivateMessage(e.target.value)}
              />
            </Field>
            <Btn variant="primary" onClick={sendPrivate}>
              {t('socket.sendPrivate')}
            </Btn>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-base font-semibold">{t('socket.sendGroupMessage')}</h3>
          <div className="space-y-3">
            <Field label={t('socket.groupId')}>
              <Input value={groupId} onChange={(e) => setGroupId(e.target.value)} />
            </Field>
            <Field label={t('socket.groupMessage')}>
              <TextArea
                rows={2}
                value={groupMessage}
                onChange={(e) => setGroupMessage(e.target.value)}
              />
            </Field>
            <Btn variant="primary" onClick={sendGroup}>
              {t('socket.sendGroup')}
            </Btn>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-base font-semibold">{t('socket.joinRoomBtn')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('socket.roomId')} className="min-w-[200px] flex-1">
            <Input value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          </Field>
          <Btn variant="success" onClick={joinRoom}>
            {t('socket.joinRoom')}
          </Btn>
          <Btn variant="warning" onClick={leaveRoom}>
            {t('socket.leaveRoom')}
          </Btn>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{t('socket.eventLog')}</h3>
            <p className="mt-1 text-xs text-text-muted">
              {t('socket.events')}: {listenedEvents.join(', ')}
            </p>
          </div>
          <Btn variant="secondary" onClick={clearLog}>
            {t('socket.clearLog')}
          </Btn>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs dark:border-gray-600 dark:bg-gray-950">
          {logs.length === 0 ? (
            <p className="text-text-muted">—</p>
          ) : (
            logs.map((entry) => (
              <div
                key={entry.id}
                className={`mb-2 border-s-4 ps-2 last:mb-0 ${
                  entry.kind === 'error'
                    ? 'border-red-500 text-red-700 dark:text-red-300'
                    : entry.kind === 'success'
                      ? 'border-emerald-500 text-emerald-800 dark:text-emerald-300'
                      : 'border-sky-500 text-text-secondary dark:text-gray-300'
                }`}
              >
                <span className="text-text-muted">[{entry.ts}]</span> {entry.text}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
