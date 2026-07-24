/**
 * Stored signup values — keep in sync with:
 * - `front-hafezway/src/utils/enums/signup.enums.ts`
 * - `back-hafezway/src/utils/signup.enums.ts`
 */

export const MemorizedQuranAnswer = {
  YES: 'yes',
  NO: 'no',
} as const;

export const SignupMemorizationAmount = {
  QUARTER: 'quarter',
  HALF: 'half',
  COMPLETE: 'complete',
  OTHER: 'other',
} as const;

export const SignupProgram = {
  NEW_RAWAIA: 'new_rawaia',
  REVIEW: 'review',
  IJAZAHS: 'ijazahs',
  REVISION: 'revision',
  RECITATION_CORRECTION: 'recitation_correction',
  TAFSIR_REFLECTION: 'tafsir_reflection',
} as const;

export const SignupWeeklyAmount = {
  HALF_PAGE: 'half_page',
  PAGE: 'page',
  TWO_PAGES: 'two_pages',
  HIZB: 'hizb',
  JUZ: 'juz',
  JUZAN: 'juzan',
} as const;

export const SignupStartingSurah = {
  NAS_TO_BAQARAH: 'nas_to_baqarah',
  BAQARAH_TO_NAS: 'baqarah_to_nas',
} as const;

export const SignupPlan = {
  FREE: 'free',
  TWO_HOURS_300: 'two_hours_300',
  THREE_HOURS_400: 'three_hours_400',
  EIGHT_HOURS_600: 'eight_hours_600',
} as const;

export const SignupUserType = {
  MALE: 'male',
  FEMALE: 'female',
  CHILDREN: 'children',
} as const;

export type SignupUserType = (typeof SignupUserType)[keyof typeof SignupUserType];

export const SIGNUP_USER_TYPE_VALUES = Object.values(SignupUserType) as SignupUserType[];

export const SIGNUP_PROGRAM_SKIPS_AMOUNT_WEEKLY_SURAH = new Set<string>([
  SignupProgram.RECITATION_CORRECTION,
  SignupProgram.TAFSIR_REFLECTION,
]);

export const SIGNUP_QUIZ_MEMORIZED = Object.values(MemorizedQuranAnswer);
export const SIGNUP_QUIZ_AMOUNT = Object.values(SignupMemorizationAmount);
export const SIGNUP_QUIZ_PROGRAM = Object.values(SignupProgram);
export const SIGNUP_QUIZ_WEEKLY = Object.values(SignupWeeklyAmount);
export const SIGNUP_QUIZ_SURAH = Object.values(SignupStartingSurah);
export const SIGNUP_QUIZ_PLAN = Object.values(SignupPlan);
