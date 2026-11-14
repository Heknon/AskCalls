import { type CallId, type Day, dateFromDay } from './common';

/**
 * When a call started, else when it was uploaded: call ids are UUIDv7, whose first 48 bits are the
 * Unix milliseconds the device made the id at. Ids of another kind fall back to the start of the day.
 */
export function callStartedAt(
  call: { id: CallId; day: Day },
  startedAt: string | null | undefined,
): Date {
  if (startedAt) return new Date(startedAt);
  const hex = call.id.replace(/-/g, '');
  return hex[12] === '7' ? new Date(Number.parseInt(hex.slice(0, 12), 16)) : dateFromDay(call.day);
}
