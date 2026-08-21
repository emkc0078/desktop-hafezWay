import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson, adminFetchResponse } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
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
} from '@/components/ui';

type Advertisement = {
  id: string;
  productName?: string;
  storeName?: string;
  description?: string;
  phoneNumber?: string;
  price?: number;
  adDuration?: number;
  images?: string[];
  active?: boolean;
  startDate?: string;
  endDate?: string;
  views?: number;
  updatedAt?: string;
  createdAt?: string;
};

type ListResponse = {
  data?: {
    advertisements?: Advertisement[];
  };
};

type AdForm = {
  title: string;
  link: string;
  adDuration: string;
  active: boolean;
  imageFile: File | null;
  imagePreview: string;
};

const emptyForm = (): AdForm => ({
  title: '',
  link: '',
  adDuration: '30',
  active: true,
  imageFile: null,
  imagePreview: '',
});

function resolveImageUrl(
  serverUrl: string,
  path: string | undefined,
  cacheKey?: string | number,
): string | null {
  if (!path) return null;
  const value = path.trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  const base = serverUrl.replace(/\/$/, '');

  // Absolute URLs often use APP_URL (production) while the file lives on the admin API host.
  // Rewrite any /uploads/... path onto the configured server.
  let absolute: string;
  if (/^https?:\/\//i.test(value)) {
    try {
      const pathname = new URL(value).pathname.replace(/^\/+/, '');
      if (pathname.startsWith('uploads/')) {
        absolute = `${base}/${pathname}`;
      } else {
        absolute = value;
      }
    } catch {
      absolute = value;
    }
  } else if (value.startsWith('/')) {
    absolute = `${base}${value}`;
  } else {
    absolute = value.startsWith('uploads/')
      ? `${base}/${value}`
      : `${base}/uploads/${value}`;
  }

  if (cacheKey == null || cacheKey === '') return absolute;
  const sep = absolute.includes('?') ? '&' : '?';
  return `${absolute}${sep}v=${encodeURIComponent(String(cacheKey))}`;
}

function looksLikeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('www.');
}

export function AdvertisementsPanel() {
  const t = useT();
  const { logsApiBase, serverUrl, adminToken } = useAdminSettings();
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdForm>(emptyForm());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(
    async (opts?: { preserveMessage?: boolean }) => {
      if (!adminToken) return;
      setLoading(true);
      if (!opts?.preserveMessage) {
        setMessage(null);
      }
      try {
        // Bust Redis list cache so create/delete always show up immediately.
        const qs = new URLSearchParams({
          limit: '100',
          sortBy: 'createdAt',
          sortOrder: 'desc',
          _: String(Date.now()),
        });
        const res = await adminFetchJson<ListResponse>(
          `${logsApiBase}/advertisements/getAll?${qs.toString()}`,
          adminToken,
        );
        setAds(res.data?.advertisements ?? []);
      } catch (e) {
        if (isAdminSessionExpiredError(e)) return;
        setMessage({
          type: 'err',
          text: e instanceof Error ? e.message : t('common.error'),
        });
      } finally {
        setLoading(false);
      }
    },
    [adminToken, logsApiBase, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (form.imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(form.imagePreview);
      }
    };
  }, [form.imagePreview]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (ad: Advertisement) => {
    setEditingId(ad.id);
    const preview =
      resolveImageUrl(serverUrl, ad.images?.[0], ad.updatedAt || ad.id) ?? '';
    setForm({
      title: (ad.productName || ad.storeName || '').trim(),
      link: looksLikeUrl(ad.description || '') ? String(ad.description).trim() : '',
      adDuration: String(ad.adDuration || 30),
      active: ad.active !== false,
      imageFile: null,
      imagePreview: preview,
    });
    setModalOpen(true);
  };

  const onPickImage = (file: File | null) => {
    setForm((f) => {
      if (f.imagePreview.startsWith('blob:')) URL.revokeObjectURL(f.imagePreview);
      if (!file) return { ...f, imageFile: null, imagePreview: editingId ? f.imagePreview : '' };
      return {
        ...f,
        imageFile: file,
        imagePreview: URL.createObjectURL(file),
      };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const title = form.title.trim();
    if (!title) {
      setMessage({ type: 'err', text: t('advertisements.requiredTitle') });
      return;
    }
    if (!editingId && !form.imageFile) {
      setMessage({ type: 'err', text: t('advertisements.requiredImage') });
      return;
    }

    const duration = Number(form.adDuration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 365) {
      setMessage({ type: 'err', text: t('advertisements.invalidDuration') });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const linkOrDesc = form.link.trim() || t('advertisements.defaultDescription');

      if (editingId && !form.imageFile) {
        await adminFetchJson(
          `${logsApiBase}/advertisements/update/${editingId}`,
          adminToken,
          {
            method: 'PUT',
            body: JSON.stringify({
              productName: title,
              storeName: title,
              description: linkOrDesc,
              adDuration: Math.floor(duration),
              active: form.active,
            }),
          },
        );
        setMessage({ type: 'ok', text: t('advertisements.updated') });
      } else {
        const body = new FormData();
        body.append('productName', title);
        body.append('storeName', title);
        body.append('phoneNumber', '0000000000');
        body.append('price', '0');
        body.append('adDuration', String(Math.floor(duration)));
        body.append('description', linkOrDesc);
        if (editingId) {
          body.append('active', form.active ? 'true' : 'false');
        }
        if (form.imageFile) {
          body.append('images', form.imageFile);
        }

        if (editingId) {
          await adminFetchResponse(
            `${logsApiBase}/advertisements/update/${editingId}`,
            adminToken,
            { method: 'PUT', body },
          );
          // Fix active after multipart (FormData string coerce can be unreliable).
          await adminFetchJson(
            `${logsApiBase}/advertisements/update/${editingId}`,
            adminToken,
            {
              method: 'PUT',
              body: JSON.stringify({ active: form.active }),
            },
          );
          setMessage({ type: 'ok', text: t('advertisements.updated') });
        } else {
          await adminFetchResponse(`${logsApiBase}/advertisements/create`, adminToken, {
            method: 'POST',
            body,
          });
          setMessage({ type: 'ok', text: t('advertisements.created') });
        }
      }
      setModalOpen(false);
      await load({ preserveMessage: true });
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

  const toggleActive = async (ad: Advertisement) => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const nextActive = !(ad.active !== false);
      setAds((prev) =>
        prev.map((row) => (row.id === ad.id ? { ...row, active: nextActive } : row)),
      );
      await adminFetchJson(
        `${logsApiBase}/advertisements/update/${ad.id}`,
        adminToken,
        {
          method: 'PUT',
          body: JSON.stringify({ active: nextActive }),
        },
      );
      await load({ preserveMessage: true });
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

  const remove = async (ad: Advertisement) => {
    if (!adminToken) return;
    if (!window.confirm(t('advertisements.confirmDelete'))) return;
    setLoading(true);
    try {
      setAds((prev) => prev.filter((row) => row.id !== ad.id));
      await adminFetchJson(`${logsApiBase}/advertisements/delete/${ad.id}`, adminToken, {
        method: 'DELETE',
      });
      setMessage({ type: 'ok', text: t('advertisements.deleted') });
      await load({ preserveMessage: true });
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
            {t('advertisements.title')}
          </h2>
          <p className="text-sm text-text-muted">{t('advertisements.subtitle')}</p>
        </div>
        <Btn variant="success" onClick={openCreate} disabled={loading}>
          {t('advertisements.add')}
        </Btn>
      </div>

      <Card>
        {ads.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">{t('advertisements.empty')}</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th className={tableHeadClass}>{t('advertisements.cols.preview')}</th>
                <th className={tableHeadClass}>{t('advertisements.cols.title')}</th>
                <th className={tableHeadClass}>{t('advertisements.cols.link')}</th>
                <th className={tableHeadClass}>{t('advertisements.cols.status')}</th>
                <th className={tableHeadClass}>{t('advertisements.cols.ends')}</th>
                <th className={tableHeadClass}>{t('advertisements.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => {
                const preview = resolveImageUrl(
                  serverUrl,
                  ad.images?.[0],
                  ad.updatedAt || ad.createdAt || ad.id,
                );
                const title = (ad.productName || ad.storeName || ad.id).trim();
                const link = looksLikeUrl(ad.description || '')
                  ? String(ad.description).trim()
                  : '';
                return (
                  <tr key={ad.id}>
                    <td className={tableCellClass}>
                      {preview ? (
                        <img
                          src={preview}
                          alt=""
                          className="h-14 w-24 rounded object-cover bg-gray-100 dark:bg-gray-800"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.opacity = '0.35';
                            el.title = preview;
                          }}
                        />
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className={tableCellClass}>{title}</td>
                    <td className={tableCellClass}>
                      {link ? (
                        <a
                          className="text-brand-primary underline break-all"
                          href={link.startsWith('www.') ? `https://${link}` : link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {ad.active !== false
                        ? t('advertisements.active')
                        : t('advertisements.inactive')}
                    </td>
                    <td className={tableCellClass}>
                      {ad.endDate ? new Date(ad.endDate).toLocaleDateString() : '—'}
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex flex-wrap gap-2">
                        <Btn
                          variant="secondary"
                          onClick={() => openEdit(ad)}
                          disabled={loading}
                        >
                          {t('common.edit')}
                        </Btn>
                        <Btn
                          variant="secondary"
                          onClick={() => void toggleActive(ad)}
                          disabled={loading}
                        >
                          {ad.active !== false
                            ? t('advertisements.deactivate')
                            : t('advertisements.activate')}
                        </Btn>
                        <Btn
                          variant="danger"
                          onClick={() => void remove(ad)}
                          disabled={loading}
                        >
                          {t('common.delete')}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('advertisements.modalEdit') : t('advertisements.modalCreate')}
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label={t('advertisements.fieldTitle')}>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <Field label={t('advertisements.fieldImage')}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="block w-full text-sm"
              onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-text-muted">{t('advertisements.imageHint')}</p>
            {form.imagePreview ? (
              <img
                src={form.imagePreview}
                alt=""
                className="mt-3 h-28 w-full max-w-sm rounded-lg object-cover"
              />
            ) : null}
          </Field>
          <Field label={t('advertisements.fieldLink')}>
            <Input
              placeholder="https://…"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            />
            <p className="mt-1 text-xs text-text-muted">{t('advertisements.linkHint')}</p>
          </Field>
          <Field label={t('advertisements.fieldDuration')}>
            <Select
              value={form.adDuration}
              onChange={(e) => setForm((f) => ({ ...f, adDuration: e.target.value }))}
            >
              {['7', '14', '30', '60', '90', '180', '365'].map((d) => (
                <option key={d} value={d}>
                  {t('advertisements.durationDays', { days: d })}
                </option>
              ))}
            </Select>
          </Field>
          {editingId ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="rounded"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              {t('advertisements.showOnHome')}
            </label>
          ) : null}
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
