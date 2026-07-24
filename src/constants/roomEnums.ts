/** Keep in sync with `back-hafezway/src/utils/room.enums.ts`. */

export const RoomScheduleDay = {
  SUNDAY: 'sunday',
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
} as const;

export type RoomScheduleDay = (typeof RoomScheduleDay)[keyof typeof RoomScheduleDay];

export const RoomListStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ALL: 'all',
} as const;

export type RoomListStatus = (typeof RoomListStatus)[keyof typeof RoomListStatus];

export const ROOM_SCHEDULE_DAY_VALUES = Object.values(
  RoomScheduleDay,
) as RoomScheduleDay[];
