import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useLocale, useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { Btn, Card, Field, MessageBanner, TextArea, Input } from '@/components/ui';

type TemplateField = {
  id: string;
  labelAr: string;
  labelEn: string;
  multiline: boolean;
  value: string;
  defaultValue: string;
};

type EmailTemplate = {
  key: string;
  roleAr: string;
  roleEn: string;
  whenAr: string;
  whenEn: string;
  mailbox: 'auth' | 'general' | 'care' | 'mixed';
  placeholders: string[];
  composedInNotifications: boolean;
  customized: boolean;
  fields: TemplateField[];
};

type ListResponse = { data?: { templates?: EmailTemplate[] } };
type PreviewResponse = { data?: { subject?: string; html?: string } };

/** Electron's sandboxed window leaves a srcDoc iframe blank. A blob URL still paints. */
function EmailPreviewFrame({ title, html }: { title: string; html: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [html]);

  if (!url) return null;

  return (
    <iframe
      title={title}
      className="h-full w-full rounded-lg border border-gray-200 bg-[#F9FAFB] dark:border-gray-600"
      src={url}
      sandbox="allow-same-origin"
    />
  );
}

function groupFields(fields: TemplateField[]): TemplateField[][] {
  const groups: TemplateField[][] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const next = fields[i + 1];
    const base = field.id.replace(/(Ar|En)$/, '');
    if (
      next &&
      field.id.endsWith('Ar') &&
      next.id === `${base}En` &&
      field.multiline === next.multiline
    ) {
      groups.push([field, next]);
      i += 1;
    } else {
      groups.push([field]);
    }
  }
  return groups;
}

export function EmailTemplatesPanel() {
  const t = useT();
  const { locale } = useLocale();
  const arabicUi = locale === 'ar';
  const { logsApiBase, adminToken } = useAdminSettings();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [previewLang, setPreviewLang] = useState<'ar' | 'en'>(arabicUi ? 'ar' : 'en');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const selected = templates.find((item) => item.key === selectedKey) ?? null;

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<ListResponse>(
        `${logsApiBase}/email-templates/admin`,
        adminToken,
      );
      const rows = res.data?.templates ?? [];
      setTemplates(rows);
      setSelectedKey((current) => current ?? rows[0]?.key ?? null);
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

  const loadPreview = useCallback(
    async (key: string, lang: 'ar' | 'en') => {
      if (!adminToken) return;
      try {
        const res = await adminFetchJson<PreviewResponse>(
          `${logsApiBase}/email-templates/admin/${encodeURIComponent(key)}/preview?lang=${lang}`,
          adminToken,
        );
        setPreviewSubject(res.data?.subject ?? '');
        setPreviewHtml(res.data?.html ?? '');
      } catch (e) {
        if (isAdminSessionExpiredError(e)) return;
        setPreviewHtml('');
        setPreviewSubject('');
        setMessage({
          type: 'err',
          text: e instanceof Error ? e.message : t('emailTemplates.previewFailed'),
        });
      }
    },
    [adminToken, logsApiBase, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedKey) return;
    const item = templates.find((row) => row.key === selectedKey);
    if (!item) return;
    const next: Record<string, string> = {};
    for (const field of item.fields) next[field.id] = field.value;
    setDraft(next);
  }, [selectedKey, templates]);

  useEffect(() => {
    if (!selectedKey) return;
    void loadPreview(selectedKey, previewLang);
  }, [selectedKey, previewLang, loadPreview]);

  const save = async () => {
    if (!adminToken || !selected || selected.composedInNotifications) return;
    setLoading(true);
    setMessage(null);
    try {
      await adminFetchJson(
        `${logsApiBase}/email-templates/admin/${encodeURIComponent(selected.key)}`,
        adminToken,
        { method: 'PUT', body: JSON.stringify({ fields: draft }) },
      );
      setMessage({ type: 'ok', text: t('emailTemplates.saved') });
      await load();
      await loadPreview(selected.key, previewLang);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!adminToken || !selected || selected.composedInNotifications) return;
    if (!window.confirm(t('emailTemplates.confirmReset'))) return;
    setLoading(true);
    setMessage(null);
    try {
      await adminFetchJson(
        `${logsApiBase}/email-templates/admin/${encodeURIComponent(selected.key)}/reset`,
        adminToken,
        { method: 'POST', body: '{}' },
      );
      setMessage({ type: 'ok', text: t('emailTemplates.resetDone') });
      await load();
      await loadPreview(selected.key, previewLang);
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  const mailboxLabel = (mailbox: EmailTemplate['mailbox']) => {
    if (mailbox === 'auth') return t('emailTemplates.mailboxAuth');
    if (mailbox === 'general') return t('emailTemplates.mailboxGeneral');
    if (mailbox === 'care') return t('emailTemplates.mailboxCare');
    return t('emailTemplates.mailboxMixed');
  };

  const renderField = (field: TemplateField) => (
    <Field key={field.id} label={arabicUi ? field.labelAr : field.labelEn}>
      {field.multiline ? (
        <TextArea
          rows={3}
          value={draft[field.id] ?? ''}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              [field.id]: e.target.value,
            }))
          }
        />
      ) : (
        <Input
          value={draft[field.id] ?? ''}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              [field.id]: e.target.value,
            }))
          }
        />
      )}
    </Field>
  );

  return (
    <div className="space-y-3">
      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t('emailTemplates.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary dark:text-gray-300">
            {t('emailTemplates.hint')}
          </p>
        </div>
      </div>

      <div
        className="grid items-start gap-4 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.15fr)_260px]"
        dir="ltr"
      >
        <Card className="order-3 flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col xl:sticky xl:top-4 xl:order-1">
          <div dir={arabicUi ? 'rtl' : 'ltr'} className="flex h-full min-h-0 flex-1 flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{t('emailTemplates.preview')}</h3>
            <div className="flex gap-2">
              <Btn
                variant={previewLang === 'ar' ? 'primary' : 'secondary'}
                onClick={() => setPreviewLang('ar')}
              >
                العربية
              </Btn>
              <Btn
                variant={previewLang === 'en' ? 'primary' : 'secondary'}
                onClick={() => setPreviewLang('en')}
              >
                English
              </Btn>
            </div>
          </div>
          {previewSubject ? (
            <p className="mb-2 truncate text-sm" title={previewSubject}>
              <span className="font-medium">{t('emailTemplates.subject')}: </span>
              {previewSubject}
            </p>
          ) : null}
          <div className="min-h-0 flex-1">
            {previewHtml ? (
              <EmailPreviewFrame title={t('emailTemplates.preview')} html={previewHtml} />
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-text-muted dark:border-gray-600">
                {t('emailTemplates.previewEmpty')}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">{t('emailTemplates.previewNote')}</p>
          </div>
        </Card>

        {selected ? (
          <div className="order-2 min-w-0 space-y-4" dir={arabicUi ? 'rtl' : 'ltr'}>
            <Card>
              <p className="text-sm font-semibold">
                {arabicUi ? selected.roleAr : selected.roleEn}
              </p>
              <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
                <span className="font-medium">{t('emailTemplates.when')}: </span>
                {arabicUi ? selected.whenAr : selected.whenEn}
              </p>
              <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">
                <span className="font-medium">{t('emailTemplates.mailbox')}: </span>
                {mailboxLabel(selected.mailbox)}
              </p>
              {selected.placeholders.length > 0 ? (
                <p className="mt-1 text-xs text-text-muted">
                  {t('emailTemplates.placeholders')}: {selected.placeholders.join('  ')}
                </p>
              ) : null}
            </Card>

            {selected.composedInNotifications ? (
              <Card>
                <p className="text-sm text-text-secondary dark:text-gray-300">
                  {t('emailTemplates.composedNote')}
                </p>
              </Card>
            ) : (
              <Card>
                <div className="grid gap-3">
                  {groupFields(selected.fields).map((group) =>
                    group.length === 2 ? (
                      <div
                        key={group[0].id}
                        className="grid gap-3 md:grid-cols-2"
                      >
                        {group.map(renderField)}
                      </div>
                    ) : (
                      renderField(group[0])
                    ),
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn variant="success" onClick={() => void save()} disabled={loading}>
                    {t('emailTemplates.save')}
                  </Btn>
                  <Btn variant="secondary" onClick={() => void reset()} disabled={loading}>
                    {t('emailTemplates.reset')}
                  </Btn>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="order-2" />
        )}

        <Card className="order-1 h-fit p-2 xl:sticky xl:top-4 xl:order-3">
          <div dir={arabicUi ? 'rtl' : 'ltr'}>
          <ul className="flex max-h-[calc(100dvh-9rem)] flex-col gap-1 overflow-y-auto">
            {templates.map((item) => {
              const active = item.key === selectedKey;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    className={`w-full rounded-lg px-3 py-2 text-start text-sm ${
                      active
                        ? 'bg-brand-primary text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="block font-medium">
                      {arabicUi ? item.roleAr : item.roleEn}
                    </span>
                    {item.customized ? (
                      <span className={`text-xs ${active ? 'text-white/80' : 'text-amber-600'}`}>
                        {t('emailTemplates.customized')}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
