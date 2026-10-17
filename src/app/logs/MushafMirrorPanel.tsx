import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useLocale, useT } from '@/context/LocaleContext';
import { Btn, Card, MessageBanner, Select } from '@/components/ui';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';

type MirrorMode = 'auto' | 'server' | 'upstream';
type MirrorKind = 'page' | 'audio' | 'tafsir' | 'mutashabihat';

type SourceRow = {
  kind: MirrorKind;
  id: string;
  titleAr: string;
  titleEn: string;
  total: number;
  mode: MirrorMode;
  files: number;
  bytes: number;
  degraded: boolean;
};

type JobState = {
  kind: MirrorKind;
  id: string;
  done: number;
  total: number;
  status: 'running' | 'done' | 'error' | 'cancelled';
  error?: string;
} | null;

type StatusData = {
  pages: SourceRow[];
  audio: SourceRow[];
  tafsir: SourceRow[];
  mutashabihat: SourceRow[];
  job: JobState;
};

type Envelope<T> = { message?: string; data?: T };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MushafMirrorPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const { locale } = useLocale();
  const base = `${logsApiBase}/mushaf-mirror`;
  const [status, setStatus] = useState<StatusData | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!adminToken) return;
    try {
      const body = await adminFetchJson<Envelope<StatusData>>(`${base}/admin`, adminToken);
      setStatus(body.data ?? null);
    } catch (error) {
      if (isAdminSessionExpiredError(error)) return;
      setMessage({
        text: error instanceof Error ? error.message : t('common.error'),
        type: 'error',
      });
    }
  }, [adminToken, base, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status?.job?.status !== 'running') return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load, status?.job?.status]);

  function sourceKey(row: Pick<SourceRow, 'kind' | 'id'>) {
    return `${row.kind}:${row.id}`;
  }

  function pickedItems() {
    const rows = [
      ...(status?.pages ?? []),
      ...(status?.audio ?? []),
      ...(status?.tafsir ?? []),
      ...(status?.mutashabihat ?? []),
    ];
    return rows
      .filter((row) => picked.has(sourceKey(row)))
      .map((row) => ({ kind: row.kind, id: row.id }));
  }

  function togglePick(key: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleSection(rows: SourceRow[], on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      for (const row of rows) {
        if (on) next.add(sourceKey(row));
        else next.delete(sourceKey(row));
      }
      return next;
    });
  }

  async function act(key: string, path: string, body: Record<string, unknown>, ok: string) {
    if (!adminToken) return false;
    setBusy(key);
    try {
      await adminFetchJson(`${base}${path}`, adminToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage({ text: ok, type: 'success' });
      await load();
      return true;
    } catch (error) {
      if (!isAdminSessionExpiredError(error)) {
        setMessage({
          text: error instanceof Error ? error.message : t('common.error'),
          type: 'error',
        });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function changeMode(row: SourceRow, mode: MirrorMode) {
    if (!adminToken || mode === row.mode) return;
    setBusy(`${row.kind}:${row.id}:mode`);
    try {
      await adminFetchJson(`${base}/admin/mode`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ kind: row.kind, id: row.id, mode }),
      });
      setMessage({ text: t('mushafMirror.modeSaved'), type: 'success' });
      await load();
    } catch (error) {
      if (!isAdminSessionExpiredError(error)) {
        setMessage({
          text: error instanceof Error ? error.message : t('common.error'),
          type: 'error',
        });
      }
    } finally {
      setBusy(null);
    }
  }

  if (!adminToken) {
    return <p className="text-sm text-text-muted">{t('mushafMirror.signIn')}</p>;
  }

  const title = (row: SourceRow) => (locale === 'ar' ? row.titleAr : row.titleEn);

  const table = (rows: SourceRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-text-muted">
            <th className="px-2 py-2">
              <input
                type="checkbox"
                aria-label={t('mushafMirror.downloadSelected')}
                checked={rows.length > 0 && rows.every((row) => picked.has(sourceKey(row)))}
                onChange={(event) => toggleSection(rows, event.target.checked)}
              />
            </th>
            <th className="px-2 py-2 font-medium">{t('mushafMirror.source')}</th>
            <th className="px-2 py-2 font-medium">{t('mushafMirror.files')}</th>
            <th className="px-2 py-2 font-medium">{t('mushafMirror.mode')}</th>
            <th className="px-2 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}:${row.id}`} className="border-t border-gray-100 dark:border-gray-700">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  aria-label={title(row)}
                  checked={picked.has(sourceKey(row))}
                  onChange={(event) => togglePick(sourceKey(row), event.target.checked)}
                />
              </td>
              <td className="px-2 py-2">
                <div className="font-medium">{title(row)}</div>
                {row.degraded ? (
                  <div className="text-xs text-amber-600">{t('mushafMirror.degraded')}</div>
                ) : null}
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                {row.files} / {row.total}
                {row.bytes > 0 ? ` · ${formatBytes(row.bytes)}` : ''}
              </td>
              <td className="px-2 py-2">
                <Select
                  value={row.mode}
                  disabled={busy !== null}
                  onChange={(event) => void changeMode(row, event.target.value as MirrorMode)}
                >
                  <option value="auto">{t('mushafMirror.modeAuto')}</option>
                  <option value="server">{t('mushafMirror.modeServer')}</option>
                  <option value="upstream">{t('mushafMirror.modeUpstream')}</option>
                </Select>
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    disabled={busy !== null || status?.job?.status === 'running'}
                    onClick={() =>
                      void act(
                        `${row.id}:download`,
                        '/admin/download',
                        { kind: row.kind, id: row.id },
                        t('mushafMirror.started'),
                      )
                    }
                  >
                    {t('mushafMirror.download')}
                  </Btn>
                  <Btn
                    variant="danger"
                    disabled={busy !== null || row.files === 0 || status?.job?.status === 'running'}
                    onClick={() => {
                      if (!window.confirm(t('mushafMirror.deleteCopyConfirm'))) return;
                      void act(
                        `${row.id}:delete`,
                        '/admin/copies/delete',
                        { items: [{ kind: row.kind, id: row.id }] },
                        t('mushafMirror.copiesDeleted'),
                      );
                    }}
                  >
                    {t('mushafMirror.deleteCopy')}
                  </Btn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const job = status?.job;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{t('mushafMirror.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="secondary" onClick={() => void load()}>
          {t('mushafMirror.refresh')}
        </Btn>
        {job?.status === 'running' ? (
          <Btn variant="danger" onClick={() => void act('cancel', '/admin/download/cancel', {}, t('mushafMirror.cancel'))}>
            {t('mushafMirror.cancel')}
          </Btn>
        ) : null}
        <span className="text-sm text-text-muted">
          {job
            ? `${t('mushafMirror.job').replace('{done}', String(job.done)).replace('{total}', String(job.total))} · ${job.id} · ${job.status}`
            : t('mushafMirror.noJob')}
        </span>
      </div>
      <p className="text-sm text-text-muted">{t('mushafMirror.selectionHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Btn
          variant="secondary"
          disabled={busy !== null || status?.job?.status === 'running' || pickedItems().length === 0}
          onClick={() => {
            const items = pickedItems();
            if (items.length === 0) {
              setMessage({ text: t('mushafMirror.chooseFirst'), type: 'info' });
              return;
            }
            void act('download-many', '/admin/download-many', { items }, t('mushafMirror.started'));
          }}
        >
          {t('mushafMirror.downloadSelected')}
        </Btn>
        <Btn
          variant="danger"
          disabled={busy !== null || status?.job?.status === 'running' || pickedItems().length === 0}
          onClick={() => {
            const items = pickedItems();
            if (items.length === 0) {
              setMessage({ text: t('mushafMirror.chooseFirst'), type: 'info' });
              return;
            }
            if (!window.confirm(t('mushafMirror.deleteCopiesConfirm'))) return;
            void act('delete-copies', '/admin/copies/delete', { items }, t('mushafMirror.copiesDeleted'));
          }}
        >
          {t('mushafMirror.deleteSelected')}
        </Btn>
      </div>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('mushafMirror.pages')}</h2>
        {table(status?.pages ?? [])}
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('mushafMirror.audio')}</h2>
        {table(status?.audio ?? [])}
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('mushafMirror.tafsir')}</h2>
        {table(status?.tafsir ?? [])}
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('mushafMirror.mutashabihat')}</h2>
        {table(status?.mutashabihat ?? [])}
      </Card>
      {message ? (
        <MessageBanner text={message.text} type={message.type} onDismiss={() => setMessage(null)} />
      ) : null}
    </div>
  );
}
