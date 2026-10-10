import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/context/LocaleContext';
import { Btn, TableShell, tableCellClass, tableHeadClass } from '@/components/ui';
import { adminFetchJson } from '@/utils/adminFetch';
import { isAdminSessionExpiredError } from '@/utils/adminSession';
import { escapeHtml } from '@/utils/escapeHtml';

type RatingRow = {
  id: string;
  rating?: number;
  comment?: string;
  createdAt?: string;
  student?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  room?: {
    id?: string;
    nameAr?: string;
    nameEn?: string;
    reservedTeacherId?: string | null;
  } | null;
};

type Props = {
  teacherId: string;
  serverUrl: string;
  adminToken: string;
};

function sameUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function reservedTeacherIdFromRoom(room: Record<string, unknown>): string | null {
  const raw = room.reservedTeacher;
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return String(raw);
}

export function UserTeacherRatingsSection({
  teacherId,
  serverUrl,
  adminToken,
}: Props) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [summary, setSummary] = useState<{ count: number; average: number | null } | null>(
    null,
  );
  const [pagination, setPagination] = useState<{
    page: number;
    pages: number;
    total: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  } | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!adminToken || !teacherId) {
        setRatings([]);
        setSummary(null);
        setPagination(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const base = serverUrl.replace(/\/$/, '');

        // 1) Strict: resolve rooms assigned to this teacher only.
        const roomsRes = await adminFetchJson<{
          data?: { rooms?: Record<string, unknown>[] };
          rooms?: Record<string, unknown>[];
        }>(
          `${base}/api/rooms?page=1&limit=300&status=all&reservedTeacherId=${encodeURIComponent(teacherId)}`,
          adminToken,
        );
        if (signal?.aborted) return;

        const roomsRaw =
          roomsRes?.data?.rooms ??
          (Array.isArray(roomsRes?.rooms) ? roomsRes.rooms : []);

        const allowedRoomIds = new Set(
          roomsRaw
            .filter((r) => sameUserId(reservedTeacherIdFromRoom(r), teacherId))
            .map((r) => String(r._id ?? r.id ?? ''))
            .filter(Boolean),
        );

        if (allowedRoomIds.size === 0) {
          setRatings([]);
          setSummary({ count: 0, average: null });
          setPagination({
            page: 1,
            pages: 0,
            total: 0,
            hasNext: false,
            hasPrev: false,
          });
          return;
        }

        // 2) Ratings for this teacher (server-side filter) + client allow-list.
        const url = `${base}/api/rooms/admin/room-ratings?page=${page}&limit=10&teacherId=${encodeURIComponent(teacherId)}`;
        const res = await adminFetchJson<{
          data: {
            ratings?: RatingRow[];
            summary?: { count: number; average: number | null };
            filter?: { teacherId?: string; roomCount?: number };
            pagination?: {
              page: number;
              pages: number;
              total: number;
              hasNext?: boolean;
              hasPrev?: boolean;
            };
          };
        }>(url, adminToken);
        if (signal?.aborted) return;

        const incoming = Array.isArray(res.data?.ratings) ? res.data.ratings : [];
        const filtered = incoming.filter((row) => {
          const roomId = row.room?.id != null ? String(row.room.id) : '';
          if (!roomId || !allowedRoomIds.has(roomId)) return false;
          const reserved = row.room?.reservedTeacherId;
          if (reserved != null && String(reserved).trim() !== '') {
            return sameUserId(reserved, teacherId);
          }
          // Room id already verified against teacher's reserved rooms.
          return true;
        });

        setRatings(filtered);

        const apiFiltered =
          res.data?.filter?.teacherId != null &&
          sameUserId(String(res.data.filter.teacherId), teacherId);

        if (apiFiltered && filtered.length === incoming.length) {
          setSummary(res.data?.summary ?? null);
          setPagination(res.data?.pagination ?? null);
        } else {
          const avg =
            filtered.length > 0
              ? Math.round(
                  (filtered.reduce((s, r) => s + Number(r.rating || 0), 0) /
                    filtered.length) *
                    10,
                ) / 10
              : null;
          setSummary({ count: filtered.length, average: avg });
          setPagination({
            page: 1,
            pages: filtered.length > 0 ? 1 : 0,
            total: filtered.length,
            hasNext: false,
            hasPrev: false,
          });
        }
      } catch (e) {
        if (signal?.aborted) return;
        if (isAdminSessionExpiredError(e)) return;
        setError((e as Error).message);
        setRatings([]);
        setSummary(null);
        setPagination(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [adminToken, teacherId, serverUrl, page],
  );

  useEffect(() => {
    setPage(1);
    setRatings([]);
    setSummary(null);
    setPagination(null);
    setError(null);
  }, [teacherId]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const studentName = (u?: { firstName?: string; lastName?: string } | null) =>
    `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || '—';

  return (
    <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className="mb-1 font-semibold text-text-secondary">
        {t('dashboard.users.teacherRatingsSection')}
      </p>
      <p className="mb-3 text-xs text-text-muted">{t('dashboard.users.teacherRatingsHint')}</p>

      {summary && summary.count > 0 ? (
        <p className="mb-3 text-sm text-text-secondary">
          {t('dashboard.users.teacherRatingsSummary', {
            count: String(summary.count),
            average: summary.average != null ? String(summary.average) : '—',
          })}
        </p>
      ) : null}

      <div className="mb-3 flex justify-end">
        <Btn
          type="button"
          variant="secondary"
          className="!px-2.5 !py-1 text-xs"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? t('common.loading') : t('common.refresh')}
        </Btn>
      </div>

      {loading && !ratings.length ? (
        <p className="text-text-muted">{t('common.loading')}</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : !ratings.length ? (
        <p className="text-text-muted">{t('dashboard.users.teacherRatingsEmpty')}</p>
      ) : (
        <>
          <TableShell colWidths={['22%', '20%', '12%', '28%', '18%']}>
            <thead>
              <tr>
                {[
                  t('dashboard.roomRatings.cols.student'),
                  t('dashboard.roomRatings.cols.room'),
                  t('dashboard.roomRatings.cols.rating'),
                  t('dashboard.roomRatings.cols.comment'),
                  t('dashboard.roomRatings.cols.date'),
                ].map((h) => (
                  <th key={h} className={tableHeadClass}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {ratings.map((row) => (
                <tr key={row.id}>
                  <td className={`${tableCellClass} text-sm`}>
                    <div>{escapeHtml(studentName(row.student))}</div>
                    {row.student?.email ? (
                      <div className="text-xs text-text-muted">
                        {escapeHtml(String(row.student.email))}
                      </div>
                    ) : null}
                  </td>
                  <td className={`${tableCellClass} text-sm`}>
                    {row.room?.nameEn || row.room?.nameAr
                      ? escapeHtml(String(row.room.nameEn ?? row.room.nameAr))
                      : '—'}
                  </td>
                  <td className={`${tableCellClass} text-sm font-medium`}>
                    {t('dashboard.roomRatings.ratingOf', {
                      rating: String(row.rating ?? '—'),
                    })}
                  </td>
                  <td className={`${tableCellClass} whitespace-pre-wrap break-words text-sm`}>
                    {row.comment ? escapeHtml(String(row.comment)) : '—'}
                  </td>
                  <td className={`${tableCellClass} whitespace-nowrap text-xs`}>
                    {row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          {pagination && pagination.pages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-text-muted">
                {t('common.pageOf', {
                  page: String(pagination.page),
                  pages: String(pagination.pages),
                  total: String(pagination.total),
                })}
              </span>
              <div className="flex gap-2">
                <Btn
                  type="button"
                  variant="secondary"
                  className="!px-2.5 !py-1 text-xs"
                  disabled={!pagination.hasPrev || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('common.previous')}
                </Btn>
                <Btn
                  type="button"
                  variant="secondary"
                  className="!px-2.5 !py-1 text-xs"
                  disabled={!pagination.hasNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('common.next')}
                </Btn>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
