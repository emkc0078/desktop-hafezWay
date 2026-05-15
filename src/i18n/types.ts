export type Locale = 'en' | 'ar';

export type TranslationParams = Record<string, string | number>;

/** Nested translation tree (leaf values are strings). */
export type TranslationTree = {
  [key: string]: string | TranslationTree;
};
