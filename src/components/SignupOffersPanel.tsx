import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { Btn, Card, Field, Input, MessageBanner } from '@/components/ui';

type TrackOffer = {
  freeHours: number;
  freeValidityDays: number;
  paidTrialHours: number;
  paidTrialValidityDays: number;
};

type OfferSettings = {
  freeAccessDays: number;
  paidTrialDays: number;
  group: TrackOffer;
  individual: TrackOffer;
};

type OfferResponse = {
  data?: { offer?: OfferSettings };
};

const PRESETS = [7, 14, 30] as const;

const defaultTrack = (): TrackOffer => ({
  freeHours: 2,
  freeValidityDays: 30,
  paidTrialHours: 1,
  paidTrialValidityDays: 30,
});

function clampDays(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(3650, Math.floor(n));
}

function clampHours(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(500, Math.round(n * 1000) / 1000);
}

function normalizeOffer(o: Partial<OfferSettings> | undefined): OfferSettings {
  const group = { ...defaultTrack(), ...(o?.group ?? {}) };
  const individual = {
    ...defaultTrack(),
    freeHours: 0,
    ...(o?.individual ?? {}),
  };
  return {
    freeAccessDays: clampDays(o?.freeAccessDays ?? group.freeValidityDays),
    paidTrialDays: clampDays(o?.paidTrialDays ?? group.paidTrialValidityDays),
    group: {
      freeHours: clampHours(group.freeHours),
      freeValidityDays: clampDays(group.freeValidityDays),
      paidTrialHours: clampHours(group.paidTrialHours),
      paidTrialValidityDays: clampDays(group.paidTrialValidityDays),
    },
    individual: {
      freeHours: clampHours(individual.freeHours),
      freeValidityDays: clampDays(individual.freeValidityDays),
      paidTrialHours: clampHours(individual.paidTrialHours),
      paidTrialValidityDays: clampDays(individual.paidTrialValidityDays),
    },
  };
}

export function SignupOffersPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [offer, setOffer] = useState<OfferSettings>(normalizeOffer(undefined));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<OfferResponse>(
        `${logsApiBase}/signup-plans/admin/offer-settings`,
        adminToken,
      );
      setOffer(normalizeOffer(res.data?.offer));
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
      const body = normalizeOffer(offer);
      await adminFetchJson(`${logsApiBase}/signup-plans/admin/offer-settings`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setOffer(body);
      setMessage({ type: 'ok', text: t('offers.saved') });
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

  const updateTrack = (
    track: 'group' | 'individual',
    patch: Partial<TrackOffer>,
  ) => {
    setOffer((prev) => ({
      ...prev,
      [track]: { ...prev[track], ...patch },
    }));
  };

  const trackEditor = (track: 'group' | 'individual', title: string, hint: string) => {
    const block = offer[track];
    return (
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="text-base font-semibold text-text-primary dark:text-gray-100">
          {title}
        </h3>
        <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">{hint}</p>
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {t('offers.trackSeparationNote')}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('offers.freeHours')}>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={String(block.freeHours)}
              onChange={(e) =>
                updateTrack(track, { freeHours: clampHours(Number(e.target.value)) })
              }
            />
          </Field>
          <Field label={t('offers.freeValidityDays')}>
            <Input
              type="number"
              min={1}
              value={String(block.freeValidityDays)}
              onChange={(e) =>
                updateTrack(track, {
                  freeValidityDays: clampDays(Number(e.target.value)),
                })
              }
            />
          </Field>
          <Field label={t('offers.paidTrialHours')}>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={String(block.paidTrialHours)}
              onChange={(e) =>
                updateTrack(track, {
                  paidTrialHours: clampHours(Number(e.target.value)),
                })
              }
            />
          </Field>
          <Field label={t('offers.paidTrialValidityDays')}>
            <Input
              type="number"
              min={1}
              value={String(block.paidTrialValidityDays)}
              onChange={(e) =>
                updateTrack(track, {
                  paidTrialValidityDays: clampDays(Number(e.target.value)),
                })
              }
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((days) => (
            <Btn
              key={`${track}-${days}`}
              type="button"
              variant="secondary"
              onClick={() =>
                updateTrack(track, {
                  freeValidityDays: days,
                  paidTrialValidityDays: days,
                })
              }
            >
              {days === 30
                ? t('offers.presetMonth')
                : t('offers.presetDays', { days: String(days) })}
            </Btn>
          ))}
        </div>
      </section>
    );
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
        <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
          {t('offers.title')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">
          {t('offers.hint')}
        </p>

        <div className="mt-6 space-y-6">
          {trackEditor(
            'group',
            t('offers.groupTitle'),
            t('offers.groupHint'),
          )}
          {trackEditor(
            'individual',
            t('offers.individualTitle'),
            t('offers.individualHint'),
          )}
        </div>

        <div className="mt-6">
          <Btn
            type="button"
            variant="primary"
            disabled={loading}
            onClick={() => void save()}
          >
            {loading ? t('common.working') : t('offers.save')}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
