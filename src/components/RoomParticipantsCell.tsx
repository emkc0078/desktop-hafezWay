import { escapeHtml } from '@/utils/escapeHtml';

export type RoomParticipantRow = { id: string; name: string; email?: string };

export function roomParticipantsFromRecord(
  room: Record<string, unknown>,
): RoomParticipantRow[] {
  const parts = room.participants;
  if (!Array.isArray(parts)) return [];
  return parts
    .map((p, index) => {
      if (typeof p === 'string') {
        return { id: p, name: p };
      }
      if (!p || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const id = String(o._id ?? `idx-${index}`);
      const first = String(o.firstName ?? '').trim();
      const last = String(o.lastName ?? '').trim();
      const name = `${first} ${last}`.trim();
      const email = typeof o.email === 'string' ? o.email.trim() : '';
      return {
        id,
        name: name || email || id,
        email: email || undefined,
      };
    })
    .filter((row): row is RoomParticipantRow => row !== null);
}

type Props = {
  room: Record<string, unknown>;
  emptyLabel: string;
};

/** Renders participant count and a name/email list for a room table row. */
export function RoomParticipantsCell({ room, emptyLabel }: Props) {
  const list = roomParticipantsFromRecord(room);
  const cap = String(room.capacity ?? room.type ?? '');

  return (
    <div className="space-y-1">
      <p className="font-medium text-text-secondary">
        {list.length}
        {cap ? ` / ${cap}` : ''}
      </p>
      {list.length === 0 ? (
        <p className="text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="max-h-40 list-none space-y-1 overflow-y-auto border-s-2 border-gray-200 ps-2 dark:border-gray-600">
          {list.map((p) => (
            <li key={p.id} className="leading-snug">
              <span className="font-medium text-text-primary dark:text-gray-100">
                {escapeHtml(p.name)}
              </span>
              {p.email ? (
                <span className="block text-[11px] text-text-muted">{escapeHtml(p.email)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
