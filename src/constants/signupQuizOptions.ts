/** Matches `SignupQuestionSteps.web.tsx` / `SignupPlanStep` stored values (`front-hafezway`). */

/** Same as `programSkipsAmountWeeklyAndSurah` in signup flow — changing program clears amount/weekly/surah when applicable. */
export const SIGNUP_PROGRAM_SKIPS_AMOUNT_WEEKLY_SURAH = new Set<string>([
  'recitation_correction',
  'tafsir_reflection',
]);

export const SIGNUP_QUIZ_MEMORIZED = ['yes', 'no'] as const;

export const SIGNUP_QUIZ_AMOUNT = ['quarter', 'half', 'complete', 'other'] as const;

export const SIGNUP_QUIZ_PROGRAM = [
  'new_rawaia',
  'review',
  'ijazahs',
  'revision',
  'recitation_correction',
  'tafsir_reflection',
] as const;

export const SIGNUP_QUIZ_WEEKLY = [
  'half_page',
  'page',
  'two_pages',
  'hizb',
  'juz',
  'juzan',
] as const;

/** Same values as `SignupQuestionSteps.web.tsx` (two choices). Legacy DB keys `nas_baqarah` / `baqarah_nas` still resolve via the dynamic “custom server value” row when editing. */
export const SIGNUP_QUIZ_SURAH = ['nas_to_baqarah', 'baqarah_to_nas'] as const;

export const SIGNUP_QUIZ_PLAN = [
  'free',
  'two_hours_300',
  'three_hours_400',
  'eight_hours_600',
] as const;
