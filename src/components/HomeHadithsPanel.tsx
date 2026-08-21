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

type HomeHadith = {
  id: string;
  textAr: string;
  textEn?: string;
  sortOrder: number;
  isActive: boolean;
};

type ListResponse = {
  data?: { hadiths?: HomeHadith[] };
};

type HadithForm = {
  textAr: string;
  textEn: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm = (): HadithForm => ({
  textAr: '',
  textEn: '',
  sortOrder: '',
  isActive: true,
});

export function HomeHadithsPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [hadiths, setHadiths] = useState<HomeHadith[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HadithForm>(emptyForm());

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<ListResponse>(
        `${logsApiBase}/home-hadiths/admin`,
        adminToken,
      );
      setHadiths(res.data?.hadiths ?? []);
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

  const openEdit = (hadith: HomeHadith) => {
    setEditingId(hadith.id);
    setForm({
      textAr: hadith.textAr,
      textEn: hadith.textEn ?? '',
      sortOrder: String(hadith.sortOrder ?? 0),
      isActive: hadith.isActive !== false,
    });
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const textAr = form.textAr.trim();
    if (!textAr) {
      setMessage({ type: 'err', text: t('homeHadiths.requiredText') });
      return;
    }
    const sortParsed =
      form.sortOrder.trim() === '' ? undefined : Number(form.sortOrder);
    if (sortParsed !== undefined && (!Number.isFinite(sortParsed) || sortParsed < 0)) {
      setMessage({ type: 'err', text: t('homeHadiths.invalidSort') });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        textAr,
        textEn: form.textEn.trim() || undefined,
        isActive: form.isActive,
      };
      if (sortParsed !== undefined) body.sortOrder = Math.floor(sortParsed);

      if (editingId) {
        await adminFetchJson(`${logsApiBase}/home-hadiths/admin/${editingId}`, adminToken, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setMessage({ type: 'ok', text: t('homeHadiths.updated') });
      } else {
        await adminFetchJson(`${logsApiBase}/home-hadiths/admin`, adminToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage({ type: 'ok', text: t('homeHadiths.created') });
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

  const toggleActive = async (hadith: HomeHadith) => {
    if (!adminToken) return;
    setLoading(true);
    try {
      setHadiths((prev) =>
        prev.map((row) =>
          row.id === hadith.id ? { ...row, isActive: !hadith.isActive } : row,
        ),
      );
      await adminFetchJson(`${logsApiBase}/home-hadiths/admin/${hadith.id}`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !hadith.isActive }),
      });
      await load();
    } catch (err) {
      if (isAdminSessionExpiredError(err)) return;
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('common.error'),
      });
      await load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (hadith: HomeHadith) => {
    if (!adminToken) return;
    if (!window.confirm(t('homeHadiths.confirmDelete'))) return;
    setLoading(true);
    try {
      setHadiths((prev) => prev.filter((row) => row.id !== hadith.id));
      await adminFetchJson(`${logsApiBase}/home-hadiths/admin/${hadith.id}`, adminToken, {
        method: 'DELETE',
      });
      setMessage({ type: 'ok', text: t('homeHadiths.deleted') });
      await load();
    } catch (err) {
      if (isAdminSessionExpiredError(err)) return;
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('common.error'),
      });
      await load();
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
          <h2 className="text-lg font-semibold text-text-primary">
            {t('homeHadiths.title')}
          </h2>
          <p className="text-sm text-text-muted">{t('homeHadiths.subtitle')}</p>
        </div>
        <Btn variant="success" onClick={openCreate} disabled={loading}>
          {t('homeHadiths.add')}
        </Btn>
      </div>

      <Card>
        {hadiths.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">{t('homeHadiths.empty')}</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th className={tableHeadClass}>{t('homeHadiths.cols.order')}</th>
                <th className={tableHeadClass}>{t('homeHadiths.cols.textAr')}</th>
                <th className={tableHeadClass}>{t('homeHadiths.cols.textEn')}</th>
                <th className={tableHeadClass}>{t('homeHadiths.cols.status')}</th>
                <th className={tableHeadClass}>{t('homeHadiths.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {hadiths.map((hadith) => (
                <tr key={hadith.id}>
                  <td className={tableCellClass}>{hadith.sortOrder}</td>
                  <td className={`${tableCellClass} max-w-md`}>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm" dir="rtl">
                      {hadith.textAr}
                    </p>
                  </td>
                  <td className={`${tableCellClass} max-w-sm`}>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm">
                      {hadith.textEn || '—'}
                    </p>
                  </td>
                  <td className={tableCellClass}>
                    {hadith.isActive
                      ? t('homeHadiths.active')
                      : t('homeHadiths.inactive')}
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-2">
                      <Btn
                        variant="secondary"
                        onClick={() => openEdit(hadith)}
                        disabled={loading}
                      >
                        {t('common.edit')}
                      </Btn>
                      <Btn
                        variant="secondary"
                        onClick={() => void toggleActive(hadith)}
                        disabled={loading}
                      >
                        {hadith.isActive
                          ? t('homeHadiths.deactivate')
                          : t('homeHadiths.activate')}
                      </Btn>
                      <Btn
                        variant="danger"
                        onClick={() => void remove(hadith)}
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
        title={editingId ? t('homeHadiths.modalEdit') : t('homeHadiths.modalCreate')}
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label={t('homeHadiths.fieldTextAr')}>
            <textarea
              required
              rows={5}
              dir="rtl"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-primary dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.textAr}
              onChange={(e) => setForm((f) => ({ ...f, textAr: e.target.value }))}
            />
          </Field>
          <Field label={t('homeHadiths.fieldTextEn')}>
            <textarea
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-primary dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.textEn}
              onChange={(e) => setForm((f) => ({ ...f, textEn: e.target.value }))}
              placeholder={t('homeHadiths.textEnHint')}
            />
          </Field>
          <Field label={t('homeHadiths.sortOrder')}>
            <Input
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              placeholder={t('homeHadiths.sortOrderPlaceholder')}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="rounded"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            {t('homeHadiths.showOnHome')}
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
