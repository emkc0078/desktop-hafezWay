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
  Select,
  TableShell,
  TextArea,
  tableCellClass,
  tableHeadClass,
} from '@/components/ui';

type SignupPlanRow = {
  planKey: string;
  labelEn: string;
  labelAr: string;
  sortOrder: number;
  isActive: boolean;
  tier: 'paid' | 'free';
  track?: 'group' | 'individual';
  monthlyHours?: number | null;
  priceAmount: number | null;
  currency: string;
  packageDetailsEn: string;
  packageDetailsAr: string;
  confirmHeadingEn: string;
  confirmHeadingAr: string;
  confirmTrialLineEn?: string;
  confirmTrialLineAr?: string;
  confirmActivateBeforeEn?: string;
  confirmActivateAfterEn?: string;
  confirmActivateBeforeAr?: string;
  confirmActivateAfterAr?: string;
  confirmFreeSubtitleEn?: string;
  confirmFreeSubtitleAr?: string;
};

type PageSettings = {
  planHeadingEn?: string;
  planHeadingAr?: string;
  packageDetailsTitleEn?: string;
  packageDetailsTitleAr?: string;
  getStartedFreeLabelEn?: string;
  getStartedFreeLabelAr?: string;
};

type AdminListResponse = {
  data?: { page?: PageSettings | null; plans?: SignupPlanRow[] };
};

const PLAN_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

const HOURS_WORD: Record<number, string> = {
  1: 'one_hour',
  2: 'two_hours',
  3: 'three_hours',
  4: 'four_hours',
  6: 'six_hours',
  8: 'eight_hours',
  10: 'ten_hours',
  12: 'twelve_hours',
};

function slugifyPlanKey(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!slug) return '';
  return /^[a-z]/.test(slug) ? slug : `plan_${slug}`;
}

function suggestPlanKey(form: Partial<SignupPlanRow>): string {
  if (form.tier === 'free') return 'free';
  const hours = Number(form.monthlyHours);
  const price = Number(form.priceAmount);
  const hoursPart =
    Number.isFinite(hours) && hours > 0
      ? (HOURS_WORD[hours] ?? `hours_${Math.round(hours)}`)
      : '';
  const trackPart = form.track === 'individual' ? 'individual' : '';
  const pricePart =
    Number.isFinite(price) && price > 0 ? String(Math.round(price)) : '';
  const generated = [hoursPart, trackPart, pricePart].filter(Boolean).join('_');
  if (generated && PLAN_KEY_RE.test(generated)) return generated;
  return slugifyPlanKey(form.labelEn ?? '');
}

const emptyPlanForm = (): Partial<SignupPlanRow> & { planKey: string } => ({
  planKey: '',
  labelEn: '',
  labelAr: '',
  sortOrder: 0,
  isActive: true,
  tier: 'paid',
  track: 'group',
  monthlyHours: 2,
  priceAmount: 0,
  currency: 'EGP',
  packageDetailsEn: '',
  packageDetailsAr: '',
  confirmHeadingEn: '',
  confirmHeadingAr: '',
  confirmTrialLineEn: 'Enjoy A Free Month Until {date}',
  confirmTrialLineAr: 'استمتع بشهر مجاني حتى {date}',
  confirmActivateBeforeEn: 'Make sure to activate your account by ',
  confirmActivateAfterEn:
    ' by paying your subscription so you can continue with us.',
  confirmActivateBeforeAr: 'تأكد من تفعيل حسابك قبل ',
  confirmActivateAfterAr: ' بدفع اشتراكك للاستمرار معنا.',
  confirmFreeSubtitleEn: '',
  confirmFreeSubtitleAr: '',
});

export function SignupPlansPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [plans, setPlans] = useState<SignupPlanRow[]>([]);
  const [page, setPage] = useState<PageSettings>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm());
  const [planKeyTouched, setPlanKeyTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<AdminListResponse>(
        `${logsApiBase}/signup-plans/admin/all`,
        adminToken,
      );
      setPlans(res.data?.plans ?? []);
      setPage(res.data?.page ?? {});
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

  const savePage = async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      await adminFetchJson(`${logsApiBase}/signup-plans/admin/page-settings`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify(page),
      });
      setMessage({ type: 'ok', text: t('signupPlans.pageSaved') });
      await load();
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

  const openCreate = () => {
    setEditingKey(null);
    setPlanKeyTouched(false);
    setFormError(null);
    const form = emptyPlanForm();
    form.planKey = suggestPlanKey(form);
    setPlanForm(form);
    setPlanModalOpen(true);
  };

  const openEdit = (row: SignupPlanRow) => {
    setEditingKey(row.planKey);
    setPlanKeyTouched(true);
    setFormError(null);
    setPlanForm({ ...row });
    setPlanModalOpen(true);
  };

  const savePlan = async () => {
    if (!adminToken) return;
    const suggested = suggestPlanKey(planForm);
    const planKey = slugifyPlanKey(planForm.planKey || suggested);
    if (!PLAN_KEY_RE.test(planKey)) {
      setFormError(t('signupPlans.planKeyInvalid'));
      return;
    }
    const labelEn = (planForm.labelEn ?? '').trim();
    const labelAr = (planForm.labelAr ?? '').trim();
    if (!labelEn || !labelAr) {
      setFormError(t('signupPlans.labelsRequired'));
      return;
    }
    const confirmHeadingEn =
      (planForm.confirmHeadingEn ?? '').trim() || labelEn;
    const confirmHeadingAr =
      (planForm.confirmHeadingAr ?? '').trim() || labelAr;
    setLoading(true);
    setFormError(null);
    setMessage(null);
    try {
      const body = {
        ...planForm,
        planKey,
        labelEn,
        labelAr,
        confirmHeadingEn,
        confirmHeadingAr,
        track: planForm.tier === 'free' ? 'group' : (planForm.track ?? 'group'),
      };
      if (editingKey) {
        await adminFetchJson(
          `${logsApiBase}/signup-plans/admin/${encodeURIComponent(editingKey)}`,
          adminToken,
          { method: 'PATCH', body: JSON.stringify(body) },
        );
      } else {
        await adminFetchJson(`${logsApiBase}/signup-plans/admin`, adminToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setPlanModalOpen(false);
      setMessage({ type: 'ok', text: t('signupPlans.planSaved') });
      await load();
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setFormError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const togglePlanActive = async (row: SignupPlanRow) => {
    if (!adminToken) return;
    const nextActive = !row.isActive;
    const confirmKey = nextActive
      ? 'signupPlans.confirmActivate'
      : 'signupPlans.confirmDeactivate';
    if (!window.confirm(t(confirmKey, { planKey: row.planKey }))) return;
    setLoading(true);
    try {
      await adminFetchJson(
        `${logsApiBase}/signup-plans/admin/${encodeURIComponent(row.planKey)}`,
        adminToken,
        { method: 'PATCH', body: JSON.stringify({ isActive: nextActive }) },
      );
      setMessage({
        type: 'ok',
        text: nextActive ? t('signupPlans.activated') : t('signupPlans.deactivated'),
      });
      await load();
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

  const deletePlan = async (planKey: string) => {
    if (!adminToken) return;
    if (!window.confirm(t('signupPlans.confirmDelete'))) return;
    setLoading(true);
    try {
      await adminFetchJson(
        `${logsApiBase}/signup-plans/admin/${encodeURIComponent(planKey)}`,
        adminToken,
        { method: 'DELETE' },
      );
      setMessage({ type: 'ok', text: t('signupPlans.planDeleted') });
      await load();
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

  const setPageField = (key: keyof PageSettings, value: string) => {
    setPage((p) => ({ ...p, [key]: value }));
  };

  const setPlanField = <K extends keyof SignupPlanRow>(
    key: K,
    value: SignupPlanRow[K],
  ) => {
    setPlanForm((f) => {
      const next = { ...f, [key]: value };
      if (
        !editingKey &&
        !planKeyTouched &&
        (key === 'monthlyHours' ||
          key === 'priceAmount' ||
          key === 'track' ||
          key === 'tier' ||
          key === 'labelEn')
      ) {
        next.planKey = suggestPlanKey(next);
      }
      return next;
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
          <h2 className="text-lg font-semibold">{t('signupPlans.pageTitle')}</h2>
          <Btn variant="secondary" onClick={() => void load()} disabled={loading}>
            {t('common.refresh')}
          </Btn>
        </div>
        <p className="mb-4 text-sm text-text-secondary dark:text-gray-300">
          {t('signupPlans.pageHint')}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('signupPlans.planHeadingEn')}>
            <Input
              value={page.planHeadingEn ?? ''}
              onChange={(e) => setPageField('planHeadingEn', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.planHeadingAr')}>
            <Input
              value={page.planHeadingAr ?? ''}
              onChange={(e) => setPageField('planHeadingAr', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.packageDetailsTitleEn')}>
            <Input
              value={page.packageDetailsTitleEn ?? ''}
              onChange={(e) => setPageField('packageDetailsTitleEn', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.packageDetailsTitleAr')}>
            <Input
              value={page.packageDetailsTitleAr ?? ''}
              onChange={(e) => setPageField('packageDetailsTitleAr', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.freeButtonEn')}>
            <Input
              value={page.getStartedFreeLabelEn ?? ''}
              onChange={(e) => setPageField('getStartedFreeLabelEn', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.freeButtonAr')}>
            <Input
              value={page.getStartedFreeLabelAr ?? ''}
              onChange={(e) => setPageField('getStartedFreeLabelAr', e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Btn variant="success" onClick={() => void savePage()} disabled={loading}>
            {t('signupPlans.savePage')}
          </Btn>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('signupPlans.plansTitle')}</h2>
          <Btn variant="success" onClick={openCreate}>
            {t('signupPlans.addPlan')}
          </Btn>
        </div>
        <p className="mb-4 text-sm text-text-secondary dark:text-gray-300">
          {t('signupPlans.plansHint')}
        </p>
        <TableShell colWidths={['12%', '16%', '16%', '8%', '10%', '8%', '8%', '22%']}>
          <thead>
            <tr>
              <th className={tableHeadClass}>{t('signupPlans.colKey')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colLabel')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colLabelAr')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colTrack')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colTier')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colPrice')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colActive')}</th>
              <th className={tableHeadClass}>{t('signupPlans.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.planKey}>
                <td className={tableCellClass}>{p.planKey}</td>
                <td className={tableCellClass}>{p.labelEn}</td>
                <td className={`${tableCellClass} text-end`} dir="rtl">
                  {p.labelAr}
                </td>
                <td className={tableCellClass}>
                  {p.track === 'individual'
                    ? t('signupPlans.trackIndividual')
                    : t('signupPlans.trackGroup')}
                  {p.monthlyHours != null && p.monthlyHours > 0 ? (
                    <div className="text-xs text-text-muted">
                      {p.monthlyHours} {t('signupPlans.hoursUnit')}
                    </div>
                  ) : null}
                </td>
                <td className={tableCellClass}>{p.tier}</td>
                <td className={tableCellClass}>
                  {p.tier === 'paid'
                    ? `${p.priceAmount ?? 0} ${p.currency}`
                    : '—'}
                </td>
                <td className={tableCellClass}>
                  {p.isActive ? t('signupPlans.active') : t('signupPlans.inactive')}
                </td>
                <td className={tableCellClass}>
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="secondary" onClick={() => openEdit(p)}>
                      {t('signupPlans.edit')}
                    </Btn>
                    {p.isActive ? (
                      <Btn
                        variant="warning"
                        disabled={loading}
                        onClick={() => void togglePlanActive(p)}
                      >
                        {t('signupPlans.deactivate')}
                      </Btn>
                    ) : (
                      <Btn
                        variant="success"
                        disabled={loading}
                        onClick={() => void togglePlanActive(p)}
                      >
                        {t('signupPlans.activate')}
                      </Btn>
                    )}
                    <Btn variant="danger" onClick={() => void deletePlan(p.planKey)}>
                      {t('common.delete')}
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Card>

      <Modal
        open={planModalOpen}
        title={editingKey ? t('signupPlans.editPlan') : t('signupPlans.addPlan')}
        onClose={() => setPlanModalOpen(false)}
      >
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {formError ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {formError}
            </p>
          ) : null}
          <Field label={t('signupPlans.colKey')}>
            <Input
              value={planForm.planKey ?? ''}
              disabled={!!editingKey}
              onChange={(e) => {
                setPlanKeyTouched(true);
                setPlanField('planKey', e.target.value);
              }}
              placeholder="two_hours_individual_500"
            />
            <p className="mt-1 text-xs text-text-muted">{t('signupPlans.planKeyHint')}</p>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Label (EN)">
              <Input
                value={planForm.labelEn ?? ''}
                onChange={(e) => setPlanField('labelEn', e.target.value)}
              />
            </Field>
            <Field label="Label (AR)">
              <Input
                value={planForm.labelAr ?? ''}
                onChange={(e) => setPlanField('labelAr', e.target.value)}
              />
            </Field>
            <Field label={t('signupPlans.colTier')}>
              <Select
                value={planForm.tier ?? 'paid'}
                onChange={(e) =>
                  setPlanField('tier', e.target.value as 'paid' | 'free')
                }
              >
                <option value="paid">paid</option>
                <option value="free">free</option>
              </Select>
            </Field>
            <Field label={t('signupPlans.colTrack')}>
              <Select
                value={planForm.track ?? 'group'}
                disabled={planForm.tier === 'free'}
                onChange={(e) =>
                  setPlanField(
                    'track',
                    e.target.value as 'group' | 'individual',
                  )
                }
              >
                <option value="group">{t('signupPlans.trackGroup')}</option>
                <option value="individual">
                  {t('signupPlans.trackIndividual')}
                </option>
              </Select>
            </Field>
            <Field label={t('signupPlans.monthlyHours')}>
              <Input
                type="number"
                min={0}
                value={String(planForm.monthlyHours ?? '')}
                onChange={(e) =>
                  setPlanField(
                    'monthlyHours',
                    e.target.value === ''
                      ? null
                      : parseInt(e.target.value, 10) || 0,
                  )
                }
              />
            </Field>
            <Field label={t('signupPlans.sortOrder')}>
              <Input
                type="number"
                value={String(planForm.sortOrder ?? 0)}
                onChange={(e) =>
                  setPlanField('sortOrder', parseInt(e.target.value, 10) || 0)
                }
              />
            </Field>
            <Field label={t('signupPlans.colPrice')}>
              <Input
                type="number"
                value={String(planForm.priceAmount ?? '')}
                disabled={planForm.tier === 'free'}
                onChange={(e) =>
                  setPlanField('priceAmount', parseInt(e.target.value, 10) || 0)
                }
              />
            </Field>
            <Field label="Currency">
              <Input
                value={planForm.currency ?? 'EGP'}
                onChange={(e) => setPlanField('currency', e.target.value)}
              />
            </Field>
            <Field label={t('signupPlans.colActive')}>
              <Select
                value={planForm.isActive ? '1' : '0'}
                onChange={(e) => setPlanField('isActive', e.target.value === '1')}
              >
                <option value="1">{t('signupPlans.active')}</option>
                <option value="0">{t('signupPlans.inactive')}</option>
              </Select>
            </Field>
          </div>
          <Field label={t('signupPlans.packageDetailsEn')}>
            <TextArea
              rows={3}
              value={planForm.packageDetailsEn ?? ''}
              onChange={(e) => setPlanField('packageDetailsEn', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.packageDetailsAr')}>
            <TextArea
              rows={3}
              value={planForm.packageDetailsAr ?? ''}
              onChange={(e) => setPlanField('packageDetailsAr', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.confirmHeadingEn')}>
            <TextArea
              rows={2}
              value={planForm.confirmHeadingEn ?? ''}
              onChange={(e) => setPlanField('confirmHeadingEn', e.target.value)}
            />
          </Field>
          <Field label={t('signupPlans.confirmHeadingAr')}>
            <TextArea
              rows={2}
              value={planForm.confirmHeadingAr ?? ''}
              onChange={(e) => setPlanField('confirmHeadingAr', e.target.value)}
            />
          </Field>
          {planForm.tier === 'paid' ? (
            <>
              <Field label={t('signupPlans.trialLineEn')}>
                <Input
                  value={planForm.confirmTrialLineEn ?? ''}
                  onChange={(e) =>
                    setPlanField('confirmTrialLineEn', e.target.value)
                  }
                />
              </Field>
              <Field label={t('signupPlans.trialLineAr')}>
                <Input
                  value={planForm.confirmTrialLineAr ?? ''}
                  onChange={(e) =>
                    setPlanField('confirmTrialLineAr', e.target.value)
                  }
                />
              </Field>
              <Field label={t('signupPlans.activateBeforeEn')}>
                <Input
                  value={planForm.confirmActivateBeforeEn ?? ''}
                  onChange={(e) =>
                    setPlanField('confirmActivateBeforeEn', e.target.value)
                  }
                />
              </Field>
              <Field label={t('signupPlans.activateAfterEn')}>
                <Input
                  value={planForm.confirmActivateAfterEn ?? ''}
                  onChange={(e) =>
                    setPlanField('confirmActivateAfterEn', e.target.value)
                  }
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t('signupPlans.freeSubtitleEn')}>
                <TextArea
                  rows={2}
                  value={planForm.confirmFreeSubtitleEn ?? ''}
                  onChange={(e) =>
                    setPlanField('confirmFreeSubtitleEn', e.target.value)
                  }
                />
              </Field>
              <Field label={t('signupPlans.freeSubtitleAr')}>
                <TextArea
                  rows={2}
                  value={planForm.confirmFreeSubtitleAr ?? ''}
                  onChange={(e) =>
                    setPlanField('confirmFreeSubtitleAr', e.target.value)
                  }
                />
              </Field>
            </>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setPlanModalOpen(false)}>
            {t('common.cancel')}
          </Btn>
          <Btn variant="success" onClick={() => void savePlan()} disabled={loading}>
            {t('common.save')}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
