/**
 * Teacher signup field values — keep in sync with:
 * - `front-hafezway/src/utils/enums/signupTeacher.enums.ts`
 * - `back-hafezway` user signup profile fields
 */

export const TeacherLanguage = {
  ARABIC: 'arabic',
  ENGLISH: 'english',
  FRENCH: 'french',
  URDU: 'urdu',
  OTHER: 'other',
} as const;

export const TeacherAcademicDegree = {
  BACHELORS: 'bachelors',
  MASTERS: 'masters',
  PHD: 'phd',
  DIPLOMA: 'diploma',
  OTHER: 'other',
} as const;

export const TeacherNarration = {
  WARSH_NAFI: 'warsh_nafi',
  QALUN_NAFI: 'qalun_nafi',
  AL_BAZZI_IBN_KATHIR: 'al_bazzi_ibn_kathir',
  QUNBUL_IBN_KATHIR: 'qunbul_ibn_kathir',
  AD_DURI_ABU_AMR: 'ad_duri_abu_amr',
  AS_SUSI_ABU_AMR: 'as_susi_abu_amr',
  HISHAM_IBN_AMIR: 'hisham_ibn_amir',
  IBN_DHAKWAN_IBN_AMIR: 'ibn_dhakwan_ibn_amir',
  HAFS_ASIM: 'hafs_asim',
  SHUBAH_ASIM: 'shubah_asim',
  KHALAF_HAMZAH: 'khalaf_hamzah',
  KHALLAD_HAMZAH: 'khallad_hamzah',
  ABU_AL_HARITH_KISAI: 'abu_al_harith_kisai',
  AD_DURI_KISAI: 'ad_duri_kisai',
} as const;

export const TeacherQiraatProficiency = {
  HAFS: 'hafs',
  WARSH: 'warsh',
  QALUN: 'qalun',
  SHUBAH: 'shubah',
  OTHER: 'other',
} as const;

export const TeacherScience = {
  TAJWEED: 'tajweed_rules',
  NOOR_AL_BAYAN: 'noor_al_bayan',
  TUHFAT_ATFAL: 'matn_tuhfat_atfal',
  TUHFAT_ATFAL_EXPL: 'expl_tuhfat_atfal',
  ALJAZARIYA: 'matn_aljazariya',
  ALJAZARIYA_EXPL: 'expl_aljazariya',
} as const;

export const TEACHER_LANGUAGE_OPTIONS = Object.values(TeacherLanguage);
export const TEACHER_DEGREE_OPTIONS = Object.values(TeacherAcademicDegree);
export const TEACHER_NARRATION_OPTIONS = Object.values(TeacherNarration);
export const TEACHER_QIRAAT_OPTIONS = Object.values(TeacherQiraatProficiency);
export const TEACHER_SCIENCE_OPTIONS = Object.values(TeacherScience);
