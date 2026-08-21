import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { adminFetchJson, adminFetchResponse } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { Btn, Card, Field, Input, MessageBanner } from '@/components/ui';

type FeaturedKind = 'quran' | 'pdf' | 'image';
type QuranSourceId = 'alquran_cloud' | 'quran_com' | 'ummah';

type FeaturedBook = {
  kind: FeaturedKind;
  sourceId: QuranSourceId;
  page: number;
  identifier?: string;
  titleEn?: string;
  titleAr?: string;
  coverUrl?: string;
  link?: string;
  creator?: string;
  language?: string;
  isActive: boolean;
  updatedAt?: string;
};

type Draft = {
  kind: FeaturedKind;
  sourceId: QuranSourceId;
  page: string;
  identifier: string;
  titleEn: string;
  titleAr: string;
  coverUrl: string;
  link: string;
  creator: string;
  language: string;
  isActive: boolean;
  imageFile: File | null;
  imagePreview: string;
};

type ArchiveDoc = {
  identifier?: string;
  title?: string | string[];
  creator?: string | string[];
  language?: string | string[];
};

type TajweedPdfHit = {
  identifier: string;
  title: string;
  creator?: string;
  language?: string;
  coverUrl: string;
};

const QURAN_SOURCES: { id: QuranSourceId; labelKey: string }[] = [
  { id: 'alquran_cloud', labelKey: 'sourceAlquranCloud' },
  { id: 'quran_com', labelKey: 'sourceQuranCom' },
  { id: 'ummah', labelKey: 'sourceUmmah' },
];

function firstText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find(Boolean);
  return value;
}

function resolveCoverUrl(serverUrl: string, path: string | undefined): string {
  if (!path) return '';
  const value = path.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) {
    if (/^https?:\/\//i.test(value)) {
      try {
        const pathname = new URL(value).pathname.replace(/^\/+/, '');
        if (pathname.startsWith('uploads/')) {
          return `${serverUrl.replace(/\/$/, '')}/${pathname}`;
        }
      } catch {
        /* keep absolute */
      }
    }
    return value;
  }
  const base = serverUrl.replace(/\/$/, '');
  if (value.startsWith('/')) return `${base}${value}`;
  return value.startsWith('uploads/') ? `${base}/${value}` : `${base}/uploads/${value}`;
}

function normalizeKind(kind: unknown): FeaturedKind {
  if (kind === 'pdf') return 'pdf';
  if (kind === 'image') return 'image';
  return 'quran';
}

function toDraft(book: FeaturedBook, serverUrl: string): Draft {
  return {
    kind: normalizeKind(book.kind),
    sourceId:
      book.sourceId === 'quran_com' || book.sourceId === 'ummah'
        ? book.sourceId
        : 'alquran_cloud',
    page: String(book.page || 1),
    identifier: book.identifier ?? '',
    titleEn: book.titleEn ?? '',
    titleAr: book.titleAr ?? '',
    coverUrl: book.coverUrl ?? '',
    link: book.link ?? '',
    creator: book.creator ?? '',
    language: book.language ?? '',
    isActive: book.isActive !== false,
    imageFile: null,
    imagePreview: resolveCoverUrl(serverUrl, book.coverUrl),
  };
}

async function searchTajweedPdfs(search: string, rows = 20): Promise<TajweedPdfHit[]> {
  const term = search.replace(/["\\]/g, ' ').trim();
  const subjectQuery = term
    ? `(tajweed OR tajwid) AND "${term}"`
    : '(subject:tajweed OR subject:tajwid OR title:tajweed OR title:tajwid)';
  const query = `${subjectQuery} AND mediatype:texts AND format:pdf`;

  const params = new URLSearchParams();
  params.set('q', query);
  for (const field of ['identifier', 'title', 'creator', 'language', 'downloads']) {
    params.append('fl[]', field);
  }
  params.append('sort[]', 'downloads desc');
  params.set('rows', String(rows));
  params.set('page', '1');
  params.set('output', 'json');

  const response = await fetch(
    `https://archive.org/advancedsearch.php?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Internet Archive search failed (${response.status})`);
  }

  const json = (await response.json()) as { response?: { docs?: ArchiveDoc[] } };
  return (json.response?.docs ?? [])
    .filter(
      (doc): doc is ArchiveDoc & { identifier: string } =>
        typeof doc.identifier === 'string' && doc.identifier.length > 0,
    )
    .map((doc) => ({
      identifier: doc.identifier,
      title: firstText(doc.title) ?? doc.identifier,
      creator: firstText(doc.creator),
      language: firstText(doc.language),
      coverUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    }));
}

export function HomeFeaturedBookPanel() {
  const t = useT();
  const { logsApiBase, serverUrl, adminToken } = useAdminSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TajweedPdfHit[]>([]);
  const [searching, setSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await adminFetchJson<{ data?: { featuredBook?: FeaturedBook } }>(
        `${logsApiBase}/home-featured-book/admin`,
        adminToken,
      );
      const book = res.data?.featuredBook;
      if (!book) {
        throw new Error(t('homeFeaturedBook.loadFailed'));
      }
      setDraft(toDraft(book, serverUrl));
    } catch (e) {
      if (isAdminSessionExpiredError(e)) return;
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('common.error'),
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, logsApiBase, serverUrl, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (draft?.imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(draft.imagePreview);
      }
    };
  }, [draft?.imagePreview]);

  const runSearch = async () => {
    setSearching(true);
    setMessage(null);
    try {
      setResults(await searchTajweedPdfs(query, 20));
    } catch (e) {
      setResults([]);
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : t('homeFeaturedBook.searchFailed'),
      });
    } finally {
      setSearching(false);
    }
  };

  const pickPdf = (book: TajweedPdfHit) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            kind: 'pdf',
            identifier: book.identifier,
            titleEn: book.title,
            titleAr: book.title,
            coverUrl: book.coverUrl,
            creator: book.creator ?? '',
            language: book.language ?? '',
          }
        : current,
    );
  };

  const onPickImage = (file: File | null) => {
    setDraft((current) => {
      if (!current) return current;
      if (current.imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(current.imagePreview);
      }
      if (!file) {
        return {
          ...current,
          imageFile: null,
          imagePreview: resolveCoverUrl(serverUrl, current.coverUrl),
        };
      }
      return {
        ...current,
        kind: 'image',
        imageFile: file,
        imagePreview: URL.createObjectURL(file),
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !draft) return;

    const page = Math.max(1, Math.floor(Number(draft.page) || 1));
    if (draft.kind === 'pdf' && !draft.identifier.trim()) {
      setMessage({ type: 'err', text: t('homeFeaturedBook.pickPdf') });
      return;
    }
    if (draft.kind === 'image' && !draft.imageFile && !draft.coverUrl.trim()) {
      setMessage({ type: 'err', text: t('homeFeaturedBook.pickImage') });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      let saved: FeaturedBook | undefined;

      if (draft.kind === 'image' && draft.imageFile) {
        const body = new FormData();
        body.append('kind', 'image');
        body.append('page', String(page));
        body.append('sourceId', draft.sourceId);
        body.append('isActive', draft.isActive ? 'true' : 'false');
        if (draft.titleEn.trim()) body.append('titleEn', draft.titleEn.trim());
        if (draft.titleAr.trim()) body.append('titleAr', draft.titleAr.trim());
        if (draft.link.trim()) body.append('link', draft.link.trim());
        body.append('image', draft.imageFile);

        const response = await adminFetchResponse(
          `${logsApiBase}/home-featured-book/admin`,
          adminToken,
          { method: 'PUT', body },
        );
        const json = (await response.json()) as {
          data?: { featuredBook?: FeaturedBook };
        };
        saved = json.data?.featuredBook;
      } else {
        const res = await adminFetchJson<{ data?: { featuredBook?: FeaturedBook } }>(
          `${logsApiBase}/home-featured-book/admin`,
          adminToken,
          {
            method: 'PUT',
            body: JSON.stringify({
              kind: draft.kind,
              sourceId: draft.sourceId,
              page,
              identifier: draft.identifier.trim() || undefined,
              titleEn: draft.titleEn.trim() || undefined,
              titleAr: draft.titleAr.trim() || undefined,
              coverUrl: draft.coverUrl.trim() || undefined,
              link: draft.kind === 'image' ? draft.link.trim() || undefined : undefined,
              creator: draft.creator.trim() || undefined,
              language: draft.language.trim() || undefined,
              isActive: draft.isActive,
            }),
          },
        );
        saved = res.data?.featuredBook;
      }

      if (!saved) {
        throw new Error(t('homeFeaturedBook.saveFailed'));
      }
      setDraft(toDraft(saved, serverUrl));
      setMessage({ type: 'ok', text: t('homeFeaturedBook.saved') });
    } catch (err) {
      if (isAdminSessionExpiredError(err)) return;
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('homeFeaturedBook.saveFailed'),
      });
    } finally {
      setSaving(false);
    }
  };

  const kindBtnClass = (active: boolean) =>
    `rounded-lg border px-4 py-2 text-sm font-medium transition ${
      active
        ? 'border-brand-primary bg-brand-primary text-white'
        : 'border-gray-200 bg-white text-text-secondary hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
    }`;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary dark:text-gray-100">
            {t('homeFeaturedBook.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary dark:text-gray-300">
            {t('homeFeaturedBook.subtitle')}
          </p>
        </div>
        <Btn variant="secondary" onClick={() => void load()} disabled={loading || saving}>
          {t('common.refresh')}
        </Btn>
      </div>

      {message ? (
        <MessageBanner
          type={message.type === 'ok' ? 'success' : 'error'}
          text={message.text}
        />
      ) : null}

      {loading && !draft ? (
        <p className="py-8 text-center text-sm text-text-secondary dark:text-gray-300">
          {t('common.loading')}
        </p>
      ) : draft ? (
        <form className="space-y-6" onSubmit={(e) => void handleSave(e)}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={kindBtnClass(draft.kind === 'quran')}
              onClick={() => setDraft((c) => (c ? { ...c, kind: 'quran' } : c))}
            >
              {t('homeFeaturedBook.kindQuran')}
            </button>
            <button
              type="button"
              className={kindBtnClass(draft.kind === 'pdf')}
              onClick={() => setDraft((c) => (c ? { ...c, kind: 'pdf' } : c))}
            >
              {t('homeFeaturedBook.kindPdf')}
            </button>
            <button
              type="button"
              className={kindBtnClass(draft.kind === 'image')}
              onClick={() => setDraft((c) => (c ? { ...c, kind: 'image' } : c))}
            >
              {t('homeFeaturedBook.kindImage')}
            </button>
          </div>

          {draft.kind === 'quran' ? (
            <div>
              <p className="mb-2 text-sm font-medium text-text-primary dark:text-gray-100">
                {t('homeFeaturedBook.source')}
              </p>
              <div className="flex flex-wrap gap-2">
                {QURAN_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={kindBtnClass(draft.sourceId === source.id)}
                    onClick={() =>
                      setDraft((c) => (c ? { ...c, sourceId: source.id } : c))
                    }
                  >
                    {t(`homeFeaturedBook.${source.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {draft.kind === 'pdf' ? (
            <div className="space-y-3">
              <Field label={t('homeFeaturedBook.search')}>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[220px] flex-1"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('homeFeaturedBook.searchPlaceholder')}
                  />
                  <Btn
                    type="button"
                    variant="secondary"
                    disabled={searching}
                    onClick={() => void runSearch()}
                  >
                    {searching ? t('common.loading') : t('homeFeaturedBook.searchAction')}
                  </Btn>
                </div>
              </Field>

              {draft.identifier ? (
                <div className="flex items-center gap-3 rounded-xl border border-brand-primary/40 bg-brand-primary/5 px-3 py-3 dark:border-brand-primary/50 dark:bg-brand-primary/10">
                  {draft.coverUrl ? (
                    <img
                      src={draft.coverUrl}
                      alt=""
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-xs text-text-secondary dark:text-gray-400">
                      {t('homeFeaturedBook.selected')}
                    </p>
                    <p className="truncate text-sm font-semibold text-text-primary dark:text-gray-100">
                      {draft.titleAr || draft.titleEn || draft.identifier}
                    </p>
                  </div>
                </div>
              ) : null}

              {results.length > 0 ? (
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {results.map((book) => {
                    const active = draft.identifier === book.identifier;
                    return (
                      <li key={book.identifier}>
                        <button
                          type="button"
                          onClick={() => pickPdf(book)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-start transition ${
                            active
                              ? 'border-brand-primary bg-brand-primary/10'
                              : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700'
                          }`}
                        >
                          <img
                            src={book.coverUrl}
                            alt=""
                            className="h-14 w-10 rounded object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary dark:text-gray-100">
                              {book.title}
                            </p>
                            <p className="truncate text-xs text-text-secondary dark:text-gray-400">
                              {book.creator || t('homeFeaturedBook.unknownAuthor')}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : query.trim() && !searching ? (
                <p className="text-sm text-text-secondary dark:text-gray-300">
                  {t('homeFeaturedBook.noResults')}
                </p>
              ) : null}
            </div>
          ) : null}

          {draft.kind === 'image' ? (
            <div className="space-y-4">
              <Field label={t('homeFeaturedBook.fieldImage')}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm"
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
                <p className="mt-1 text-xs text-text-muted">
                  {t('homeFeaturedBook.imageHint')}
                </p>
                {draft.imagePreview ? (
                  <img
                    src={draft.imagePreview}
                    alt=""
                    className="mt-3 h-36 w-full max-w-sm rounded-lg object-cover"
                  />
                ) : null}
              </Field>
              <Field label={t('homeFeaturedBook.fieldLink')}>
                <Input
                  placeholder="https://…"
                  value={draft.link}
                  onChange={(e) =>
                    setDraft((c) => (c ? { ...c, link: e.target.value } : c))
                  }
                />
                <p className="mt-1 text-xs text-text-muted">
                  {t('homeFeaturedBook.linkHint')}
                </p>
              </Field>
              <Field label={t('homeFeaturedBook.fieldTitleEn')}>
                <Input
                  value={draft.titleEn}
                  onChange={(e) =>
                    setDraft((c) => (c ? { ...c, titleEn: e.target.value } : c))
                  }
                />
              </Field>
              <Field label={t('homeFeaturedBook.fieldTitleAr')}>
                <Input
                  value={draft.titleAr}
                  onChange={(e) =>
                    setDraft((c) => (c ? { ...c, titleAr: e.target.value } : c))
                  }
                />
              </Field>
            </div>
          ) : null}

          {draft.kind !== 'image' ? (
            <Field label={t('homeFeaturedBook.page')}>
              <Input
                type="number"
                min={1}
                value={draft.page}
                onChange={(e) =>
                  setDraft((c) => (c ? { ...c, page: e.target.value } : c))
                }
              />
            </Field>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary dark:text-gray-100">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) =>
                setDraft((c) => (c ? { ...c, isActive: e.target.checked } : c))
              }
            />
            {draft.isActive
              ? t('homeFeaturedBook.visible')
              : t('homeFeaturedBook.hidden')}
          </label>

          <Btn type="submit" disabled={saving || loading}>
            {saving ? t('common.loading') : t('common.save')}
          </Btn>
        </form>
      ) : null}
    </Card>
  );
}
