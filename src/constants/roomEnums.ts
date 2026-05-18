/** Keep in sync with `back-hafezway/src/utils/room.enums.ts`. */

export enum RoomScheduleDay {
  SUNDAY = 'sunday',
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
}

export enum RoomListStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ALL = 'all',
}

export const ROOM_SCHEDULE_DAY_VALUES = Object.values(
  RoomScheduleDay,
) as RoomScheduleDay[];
