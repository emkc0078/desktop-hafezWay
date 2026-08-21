import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import {
  Btn,
  Card,
  Field,
  Input,
  MessageBanner,
  Modal,
  TableShell,
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';

type CatalogVideo = {
  id: string;
  titleEn: string;
  titleAr: string;
  youtubeId: string;
  sourceUrl?: string;
  sortOrder: number;
  isActive: boolean;
};

type VideosResponse = {
  data?: { videos?: CatalogVideo[] };
};

type VideoForm = {
  titleEn: string;
  titleAr: string;
  youtubeUrl: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm = (): VideoForm => ({
  titleEn: '',
  titleAr: '',
  youtubeUrl: '',
  sortOrder: '',
  isActive: true,
});

export function VideosPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [videos, setVideos] = useState<CatalogVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VideoForm>(emptyForm());

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<VideosResponse>(
        `${logsApiBase}/videos/admin`,
        adminToken,
      );
      setVideos(res.data?.videos ?? []);
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

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (video: CatalogVideo) => {
    setEditingId(video.id);
    setForm({
      titleEn: video.titleEn,
      titleAr: video.titleAr,
      youtubeUrl: video.sourceUrl || video.youtubeId,
      sortOrder: String(video.sortOrder ?? 0),
      isActive: video.isActive !== false,
    });
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const titleEn = form.titleEn.trim();
    const titleAr = form.titleAr.trim();
    const youtubeUrl = form.youtubeUrl.trim();
    if (!titleEn || !titleAr || !youtubeUrl) {
      setMessage({ type: 'err', text: t('videos.requiredFields') });
      return;
    }
    const sortParsed = form.sortOrder.trim() === '' ? undefined : Number(form.sortOrder);
    if (sortParsed !== undefined && (!Number.isFinite(sortParsed) || sortParsed < 0)) {
      setMessage({ type: 'err', text: t('videos.invalidSort') });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        titleEn,
        titleAr,
        youtubeUrl,
        isActive: form.isActive,
      };
      if (sortParsed !== undefined) body.sortOrder = Math.floor(sortParsed);

      if (editingId) {
        await adminFetchJson(`${logsApiBase}/videos/admin/${editingId}`, adminToken, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setMessage({ type: 'ok', text: t('videos.updated') });
      } else {
        await adminFetchJson(`${logsApiBase}/videos/admin`, adminToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage({ type: 'ok', text: t('videos.created') });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      if (isAdminSessionExpiredError(err)) return;
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (video: CatalogVideo) => {
    if (!adminToken) return;
    setLoading(true);
    try {
      await adminFetchJson(`${logsApiBase}/videos/admin/${video.id}`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !video.isActive }),
      });
      await load();
    } catch (err) {
      if (isAdminSessionExpiredError(err)) return;
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (video: CatalogVideo) => {
    if (!adminToken) return;
    if (!window.confirm(t('videos.confirmDelete'))) return;
    setLoading(true);
    try {
      await adminFetchJson(`${logsApiBase}/videos/admin/${video.id}`, adminToken, {
        method: 'DELETE',
      });
      setMessage({ type: 'ok', text: t('videos.deleted') });
      await load();
    } catch (err) {
      if (isAdminSessionExpiredError(err)) return;
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('videos.title')}</h2>
          <p className="text-sm text-text-muted">{t('videos.subtitle')}</p>
        </div>
        <Btn variant="success" onClick={openCreate} disabled={loading}>
          {t('videos.add')}
        </Btn>
      </div>

      <Card>
        {videos.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">{t('videos.empty')}</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th className={tableHeadClass}>{t('videos.cols.order')}</th>
                <th className={tableHeadClass}>{t('videos.cols.titleEn')}</th>
                <th className={tableHeadClass}>{t('videos.cols.titleAr')}</th>
                <th className={tableHeadClass}>{t('videos.cols.youtube')}</th>
                <th className={tableHeadClass}>{t('videos.cols.status')}</th>
                <th className={tableHeadClass}>{t('videos.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id}>
                  <td className={tableCellClass}>{video.sortOrder}</td>
                  <td className={tableCellClass}>{video.titleEn}</td>
                  <td className={tableCellClass}>{video.titleAr}</td>
                  <td className={tableCellClass}>
                    <a
                      className="text-brand-primary underline"
                      href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {video.youtubeId}
                    </a>
                  </td>
                  <td className={tableCellClass}>
                    {video.isActive ? t('videos.active') : t('videos.inactive')}
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-2">
                      <Btn variant="secondary" onClick={() => openEdit(video)} disabled={loading}>
                        {t('common.edit')}
                      </Btn>
                      <Btn
                        variant="secondary"
                        onClick={() => void toggleActive(video)}
                        disabled={loading}
                      >
                        {video.isActive ? t('videos.deactivate') : t('videos.activate')}
                      </Btn>
                      <Btn
                        variant="danger"
                        onClick={() => void remove(video)}
                        disabled={loading}
                      >
                        {t('common.delete')}
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('videos.modalEdit') : t('videos.modalCreate')}
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label={t('videos.titleEn')}>
            <Input
              required
              value={form.titleEn}
              onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
            />
          </Field>
          <Field label={t('videos.titleAr')}>
            <Input
              required
              value={form.titleAr}
              onChange={(e) => setForm((f) => ({ ...f, titleAr: e.target.value }))}
            />
          </Field>
          <Field label={t('videos.youtubeUrl')}>
            <Input
              required
              placeholder="https://youtu.be/… or video id"
              value={form.youtubeUrl}
              onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
            />
            <p className="mt-1 text-xs text-text-muted">{t('videos.youtubeHint')}</p>
          </Field>
          <Field label={t('videos.sortOrder')}>
            <Input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              placeholder={t('videos.sortOrderPlaceholder')}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="rounded"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            {t('videos.showInApp')}
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant="primary" type="submit" disabled={loading}>
              {t('common.save')}
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}
