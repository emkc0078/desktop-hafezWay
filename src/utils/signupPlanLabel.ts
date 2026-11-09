import { SIGNUP_QUIZ_PLAN } from '@/constants/signupQuizOptions';

const I18N_PREFIX = 'dashboard.users.signupQuizVals';

/** Strip trailing `_digits` price tags: `two_hours_individual_500` → `two_hours_individual`. */
export function planKeyBase(key: string): string {
  return String(key ?? '')
    .trim()
    .replace(/_\d+$/, '');
}

/** True when the value looks like a signup/payment plan key. */
export function looksLikeSignupPlanKey(value: string | null | undefined): boolean {
  const key = String(value ?? '').trim();
  if (!key) return false;
  if (key === 'free') return true;
  if (SIGNUP_QUIZ_PLAN.includes(key as (typeof SIGNUP_QUIZ_PLAN)[number])) return true;
  const base = planKeyBase(key);
  if (SIGNUP_QUIZ_PLAN.some((catalogKey) => planKeyBase(catalogKey) === base)) {
    return true;
  }
  return /(?:^|_)(?:hours?|individual)(?:_|$)/i.test(key);
}

/**
 * Human-readable signup/payment plan label.
 * Matches exact keys, price-less aliases, and known catalog keys by base.
 */
export function signupPlanLabel(
  planKey: string | null | undefined,
  t: (key: string) => string,
): string {
  const key = String(planKey ?? '').trim();
  if (!key) return '—';

  const lookup = (candidate: string): string | null => {
    if (!candidate) return null;
    const path = `${I18N_PREFIX}.${candidate}`;
    const lbl = t(path);
    return lbl === path ? null : lbl;
  };

  const exact = lookup(key);
  if (exact) return exact;

  const base = planKeyBase(key);
  const byBase = lookup(base);
  if (byBase) return byBase;

  for (const catalogKey of SIGNUP_QUIZ_PLAN) {
    if (catalogKey === key || planKeyBase(catalogKey) === base || planKeyBase(catalogKey) === key) {
      const labeled = lookup(catalogKey);
      if (labeled) return labeled;
    }
  }

  // Last resort: readable words from snake_case (keeps unknown custom keys usable).
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}
