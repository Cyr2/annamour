/*
 * « Prévoir la soirée »: the time picker speaks the device's local time
 * (`<input type="datetime-local">`, "2026-11-21T21:00"); the server keeps milliseconds.
 */

const EVENING_HOUR = 21;
const pad = (value: number) => String(value).padStart(2, "0");

/** A time as the picker shows it, in this device's time zone. */
export function toPickerValue(at: number): string {
  const date = new Date(at);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The picker's value as a time, or null while it is incomplete. */
export function fromPickerValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? null : at;
}

/** What the picker offers first: the time already planned, else 21 h tonight, or tomorrow once it is past. */
export function initialPlanTime(plannedAt: number | undefined, now: number): number {
  if (plannedAt !== undefined && plannedAt > now) return plannedAt;
  const evening = new Date(now);
  evening.setHours(EVENING_HOUR, 0, 0, 0);
  if (evening.getTime() <= now) evening.setDate(evening.getDate() + 1);
  return evening.getTime();
}
