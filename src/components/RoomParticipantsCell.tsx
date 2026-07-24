import { escapeHtml } from '@/utils/escapeHtml';

export type RoomParticipantRow = { id: string; name: string; email?: string };

function participantId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const o = value as { id?: unknown; _id?: unknown };
    if (o.id != null && o.id !== '') return String(o.id);
    if (o._id != null && o._id !== '') return String(o._id);
  }
  return '';
}

export function roomParticipantsFromRecord(
  room: Record<string, unknown>,
): RoomParticipantRow[] {
  const parts = room.participants;
  if (!Array.isArray(parts)) return [];

  const reservedTeacherId = participantId(room.reservedTeacher);

  return parts
    .map((p, index) => {
      if (typeof p === 'string') {
        if (reservedTeacherId && p === reservedTeacherId) return null;
        return { id: p, name: p };
      }
      if (!p || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const id = String(o.id ?? o._id ?? `idx-${index}`);
      if (reservedTeacherId && id === reservedTeacherId) return null;
      if (String(o.role ?? '').toLowerCase() === 'teacher') return null;
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

/** Student seats filled / room capacity (teachers are excluded). */
export function roomStudentOccupancy(room: Record<string, unknown>): {
  occupied: number;
  capacity: number;
} {
  const list = roomParticipantsFromRecord(room);
  const capacity = Number(room.capacity ?? room.type) || 0;
  // Prefer filtered student list so an empty room always shows 0 — not capacity.
  // Fall back to API seat count when participants were not included in the payload.
  const occupied = Array.isArray(room.participants)
    ? list.length
    : typeof room.participantCount === 'number' && Number.isFinite(room.participantCount)
      ? Math.max(0, room.participantCount)
      : 0;
  return { occupied, capacity };
}

export function formatRoomOccupancy(room: Record<string, unknown>): string {
  const { occupied, capacity } = roomStudentOccupancy(room);
  return capacity > 0 ? `${occupied}/${capacity}` : String(occupied);
}

type Props = {
  room: Record<string, unknown>;
  emptyLabel: string;
};

/** Renders student name/email list for a room table row (occupancy is shown in Seats). */
export function RoomParticipantsCell({ room, emptyLabel }: Props) {
  const list = roomParticipantsFromRecord(room);

  if (list.length === 0) {
    return <p className="text-text-muted">{emptyLabel}</p>;
  }

  return (
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
  );
}
