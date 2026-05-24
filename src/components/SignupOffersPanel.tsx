import { useCallback, useEffect, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { Btn, Card, Field, Input, MessageBanner } from '@/components/ui';

type OfferSettings = {
  freeAccessDays: number;
  paidTrialDays: number;
};

type OfferResponse = {
  data?: { offer?: OfferSettings };
};

const PRESETS = [7, 15, 30, 60, 90] as const;

function clampDays(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(3650, Math.floor(n));
}

export function SignupOffersPanel() {
  const t = useT();
  const { logsApiBase, adminToken } = useAdminSettings();
  const [offer, setOffer] = useState<OfferSettings>({
    freeAccessDays: 30,
    paidTrialDays: 30,
  });
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
      const o = res.data?.offer;
      if (o) {
        setOffer({
          freeAccessDays: clampDays(o.freeAccessDays),
          paidTrialDays: clampDays(o.paidTrialDays),
        });
      }
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
      const body = {
        freeAccessDays: clampDays(offer.freeAccessDays),
        paidTrialDays: clampDays(offer.paidTrialDays),
      };
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

  const presetLabel = (days: number) => {
    if (days === 30) return t('offers.presetMonth');
    return t('offers.presetDays', { days: String(days) });
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
        <p className="mt-2 text-sm text-text-secondary dark:text-gray-300">{t('offers.hint')}</p>

        <div className="mt-6 space-y-8">
          <section>
            <h3 className="text-base font-semibold text-text-primary dark:text-gray-100">
              {t('offers.freeTitle')}
            </h3>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">
              {t('offers.freeHint')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((days) => (
                <Btn
                  key={`free-${days}`}
                  variant={offer.freeAccessDays === days ? 'primary' : 'secondary'}
                  disabled={loading}
                  onClick={() =>
                    setOffer((prev) => ({ ...prev, freeAccessDays: days }))
                  }
                >
                  {presetLabel(days)}
                </Btn>
              ))}
            </div>
            <Field label={t('offers.customDays')} className="mt-4 max-w-xs">
              <Input
                type="number"
                min={1}
                max={3650}
                disabled={loading}
                value={String(offer.freeAccessDays)}
                onChange={(e) =>
                  setOffer((prev) => ({
                    ...prev,
                    freeAccessDays: clampDays(parseInt(e.target.value, 10) || 1),
                  }))
                }
              />
            </Field>
          </section>

          <section>
            <h3 className="text-base font-semibold text-text-primary dark:text-gray-100">
              {t('offers.paidTitle')}
            </h3>
            <p className="mt-1 text-sm text-text-secondary dark:text-gray-300">
              {t('offers.paidHint')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((days) => (
                <Btn
                  key={`paid-${days}`}
                  variant={offer.paidTrialDays === days ? 'primary' : 'secondary'}
                  disabled={loading}
                  onClick={() =>
                    setOffer((prev) => ({ ...prev, paidTrialDays: days }))
                  }
                >
                  {presetLabel(days)}
                </Btn>
              ))}
            </div>
            <Field label={t('offers.customDays')} className="mt-4 max-w-xs">
              <Input
                type="number"
                min={1}
                max={3650}
                disabled={loading}
                value={String(offer.paidTrialDays)}
                onChange={(e) =>
                  setOffer((prev) => ({
                    ...prev,
                    paidTrialDays: clampDays(parseInt(e.target.value, 10) || 1),
                  }))
                }
              />
            </Field>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Btn variant="success" onClick={() => void save()} disabled={loading}>
            {t('offers.save')}
          </Btn>
          <Btn variant="secondary" onClick={() => void load()} disabled={loading}>
            {t('common.refresh')}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
