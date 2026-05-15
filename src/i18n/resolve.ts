import type { TranslationParams, TranslationTree } from './types';

export function resolvePath(tree: TranslationTree, path: string): string | undefined {
  const parts = path.split('.');
  let node: string | TranslationTree | undefined = tree;
  for (const part of parts) {
    if (node == null || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
