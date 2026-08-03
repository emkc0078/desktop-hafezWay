import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { Btn, Card, Field, Input, MessageBanner, TextArea } from '@/components/ui';

export type SiteAgreementSectionForm = {
  titleEn: string;
  titleAr: string;
  /** Blank-line separated paragraphs for editing. */
  paragraphsEnText: string;
  paragraphsArText: string;
};

export type SiteAgreementForm = {
  titleEn: string;
  titleAr: string;
  lastUpdatedEn: string;
  lastUpdatedAr: string;
  introEn: string;
  introAr: string;
  sections: SiteAgreementSectionForm[];
};

type ApiSection = {
  titleEn?: string;
  titleAr?: string;
  paragraphsEn?: string[];
  paragraphsAr?: string[];
};

type ApiAgreement = {
  titleEn?: string;
  titleAr?: string;
  lastUpdatedEn?: string;
  lastUpdatedAr?: string;
  introEn?: string;
  introAr?: string;
  sections?: ApiSection[];
};

type AgreementResponse = {
  data?: { agreement?: ApiAgreement };
};

function paragraphsToText(list: string[] | undefined): string {
  return (list ?? []).join('\n\n');
}

function textToParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function emptySection(): SiteAgreementSectionForm {
  return {
    titleEn: '',
    titleAr: '',
    paragraphsEnText: '',
    paragraphsArText: '',
  };
}

function fromApi(agreement?: ApiAgreement): SiteAgreementForm {
  return {
    titleEn: agreement?.titleEn ?? '',
    titleAr: agreement?.titleAr ?? '',
    lastUpdatedEn: agreement?.lastUpdatedEn ?? '',
    lastUpdatedAr: agreement?.lastUpdatedAr ?? '',
    introEn: agreement?.introEn ?? '',
    introAr: agreement?.introAr ?? '',
    sections: (agreement?.sections ?? []).map((s) => ({
      titleEn: s.titleEn ?? '',
      titleAr: s.titleAr ?? '',
      paragraphsEnText: paragraphsToText(s.paragraphsEn),
      paragraphsArText: paragraphsToText(s.paragraphsAr),
    })),
  };
}

function toApiBody(form: SiteAgreementForm) {
  return {
    titleEn: form.titleEn.trim(),
    titleAr: form.titleAr.trim(),
    lastUpdatedEn: form.lastUpdatedEn.trim(),
    lastUpdatedAr: form.lastUpdatedAr.trim(),
    introEn: form.introEn.trim(),
    introAr: form.introAr.trim(),
    sections: form.sections.map((s) => ({
      titleEn: s.titleEn.trim(),
      titleAr: s.titleAr.trim(),
      paragraphsEn: textToParagraphs(s.paragraphsEnText),
      paragraphsAr: textToParagraphs(s.paragraphsArText),
    })),
  };
}

export function SiteAgreementPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [form, setForm] = useState<SiteAgreementForm>(fromApi());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<AgreementResponse>(
        `${logsApiBase}/site-agreement/admin`,
        adminToken,
      );
      setForm(fromApi(res.data?.agreement));
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

  const save = async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const body = toApiBody(form);
      const res = await adminFetchJson<AgreementResponse>(
        `${logsApiBase}/site-agreement/admin`,
        adminToken,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );
      setForm(fromApi(res.data?.agreement ?? body));
      setMessage({ type: 'ok', text: t('siteAgreement.saved') });
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

  const updateSection = (
    index: number,
    patch: Partial<SiteAgreementSectionForm>,
  ) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const addSection = () => {
    setForm((prev) => ({
      ...prev,
      sections: [...prev.sections, emptySection()],
    }));
  };

  const removeSection = (index: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setForm((prev) => {
      const next = [...prev.sections];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return { ...prev, sections: next };
    });
  };

  return (
    <div className="space-y-6">
      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
              {t('siteAgreement.title')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">
              {t('siteAgreement.hint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" disabled={loading} onClick={() => void load()}>
              {t('common.refresh')}
            </Btn>
            <Btn variant="success" disabled={loading || !adminToken} onClick={() => void save()}>
              {t('siteAgreement.save')}
            </Btn>
          </div>
        </div>

        {!adminToken ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t('siteAgreement.loginRequired')}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={t('siteAgreement.titleEn')}>
            <Input
              disabled={loading}
              value={form.titleEn}
              onChange={(e) => setForm((p) => ({ ...p, titleEn: e.target.value }))}
            />
          </Field>
          <Field label={t('siteAgreement.titleAr')}>
            <Input
              disabled={loading}
              dir="rtl"
              value={form.titleAr}
              onChange={(e) => setForm((p) => ({ ...p, titleAr: e.target.value }))}
            />
          </Field>
          <Field label={t('siteAgreement.lastUpdatedEn')}>
            <Input
              disabled={loading}
              value={form.lastUpdatedEn}
              onChange={(e) =>
                setForm((p) => ({ ...p, lastUpdatedEn: e.target.value }))
              }
            />
          </Field>
          <Field label={t('siteAgreement.lastUpdatedAr')}>
            <Input
              disabled={loading}
              dir="rtl"
              value={form.lastUpdatedAr}
              onChange={(e) =>
                setForm((p) => ({ ...p, lastUpdatedAr: e.target.value }))
              }
            />
          </Field>
          <Field label={t('siteAgreement.introEn')} className="md:col-span-2">
            <TextArea
              disabled={loading}
              rows={4}
              value={form.introEn}
              onChange={(e) => setForm((p) => ({ ...p, introEn: e.target.value }))}
            />
          </Field>
          <Field label={t('siteAgreement.introAr')} className="md:col-span-2">
            <TextArea
              disabled={loading}
              rows={4}
              dir="rtl"
              value={form.introAr}
              onChange={(e) => setForm((p) => ({ ...p, introAr: e.target.value }))}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-text-primary dark:text-gray-100">
          {t('siteAgreement.sections')}
        </h3>
        <Btn variant="info" disabled={loading} onClick={addSection}>
          {t('siteAgreement.addSection')}
        </Btn>
      </div>

      {form.sections.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">{t('siteAgreement.noSections')}</p>
        </Card>
      ) : (
        form.sections.map((section, index) => (
          <Card key={`section-${index}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-text-primary dark:text-gray-100">
                {t('siteAgreement.sectionN', { n: String(index + 1) })}
              </h4>
              <div className="flex flex-wrap gap-2">
                <Btn
                  variant="secondary"
                  disabled={loading || index === 0}
                  onClick={() => moveSection(index, -1)}
                >
                  {t('siteAgreement.moveUp')}
                </Btn>
                <Btn
                  variant="secondary"
                  disabled={loading || index === form.sections.length - 1}
                  onClick={() => moveSection(index, 1)}
                >
                  {t('siteAgreement.moveDown')}
                </Btn>
                <Btn
                  variant="danger"
                  disabled={loading}
                  onClick={() => removeSection(index)}
                >
                  {t('siteAgreement.removeSection')}
                </Btn>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('siteAgreement.sectionTitleEn')}>
                <Input
                  disabled={loading}
                  value={section.titleEn}
                  onChange={(e) =>
                    updateSection(index, { titleEn: e.target.value })
                  }
                />
              </Field>
              <Field label={t('siteAgreement.sectionTitleAr')}>
                <Input
                  disabled={loading}
                  dir="rtl"
                  value={section.titleAr}
                  onChange={(e) =>
                    updateSection(index, { titleAr: e.target.value })
                  }
                />
              </Field>
              <Field label={t('siteAgreement.paragraphsEn')} className="md:col-span-2">
                <TextArea
                  disabled={loading}
                  rows={5}
                  value={section.paragraphsEnText}
                  onChange={(e) =>
                    updateSection(index, { paragraphsEnText: e.target.value })
                  }
                  placeholder={t('siteAgreement.paragraphsHint')}
                />
              </Field>
              <Field label={t('siteAgreement.paragraphsAr')} className="md:col-span-2">
                <TextArea
                  disabled={loading}
                  rows={5}
                  dir="rtl"
                  value={section.paragraphsArText}
                  onChange={(e) =>
                    updateSection(index, { paragraphsArText: e.target.value })
                  }
                  placeholder={t('siteAgreement.paragraphsHint')}
                />
              </Field>
            </div>
          </Card>
        ))
      )}

      <div className="flex justify-end">
        <Btn variant="success" disabled={loading || !adminToken} onClick={() => void save()}>
          {t('siteAgreement.save')}
        </Btn>
      </div>
    </div>
  );
}
