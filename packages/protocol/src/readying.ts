/**
 * Starting together: the film (at its start, on resume, on a new episode)
 * only starts once every device has some of it downloaded ahead. A weak link
 * that starts on an empty buffer stalls within the first minute, and a stall
 * pauses everyone for twenty seconds; a few seconds of waiting up front is
 * far less disruptive.
 *
 * Never indefinitely, and only for a device that is actually downloading:
 * one whose lead stopped growing (Safari's own player often loads nothing
 * while paused) is not waited for, and after READY_MAX_WAIT_MS the film
 * starts anyway.
 */

/** Seconds every device should have downloaded ahead before the film starts. */
export const READY_LEAD = 30;

/** The film starts after this long whatever the leads. */
export const READY_MAX_WAIT_MS = 25_000;

/** A device whose lead has not grown for this long is not waited for. */
export const LEAD_STUCK_MS = 4000;

/** While waiting, a device reports its lead at least this often, so deadlines are noticed. */
export const LEAD_REPORT_MS = 2000;

/** A smaller change in lead is not worth a message, unless it crosses the target. */
export const LEAD_REPORT_STEP = 1;

export interface Readying {
  /** Seconds of lead each device must have. */
  target: number;
  /** Server time after which the film starts anyway. */
  until: number;
}

/** What the room knows of one device's lead. */
export interface DeviceLead {
  seconds: number;
  /** When it last grew (or when the wait began). */
  grewAt: number;
}

/** The lead needed from `position`: READY_LEAD, or what is left of the film near its end. */
export function readyTarget(position: number, duration: number | undefined): number {
  if (duration === undefined || !Number.isFinite(duration)) return READY_LEAD;
  return Math.min(READY_LEAD, Math.max(0, duration - position - 0.5));
}

/**
 * A device is ready when it has the lead, when its lead stopped growing, or
 * when it never reports one (an older app): only a device that is visibly
 * downloading holds the start.
 */
export function isReady(lead: DeviceLead | undefined, target: number, now: number): boolean {
  return lead === undefined || lead.seconds >= target || now - lead.grewAt >= LEAD_STUCK_MS;
}

/** Everyone is ready, or the wait has lasted long enough. */
export function readyToStart(leads: ReadonlyArray<DeviceLead | undefined>, readying: Readying, now: number): boolean {
  return now >= readying.until || leads.every((lead) => isReady(lead, readying.target, now));
}

/** A new report: the lead's growth time moves only when it actually grew. */
export function nextLead(previous: DeviceLead | undefined, seconds: number, now: number): DeviceLead {
  if (!previous || seconds > previous.seconds + 0.5) return { seconds, grewAt: now };
  return { seconds, grewAt: previous.grewAt };
}

export interface LeadReport {
  lead: number;
  at: number;
}

/**
 * Whether a paused device should tell the room its lead now: at once when it
 * crosses the target, on a real change (at most four times per LEAD_REPORT_MS),
 * and, while the room waits, every LEAD_REPORT_MS even unchanged.
 */
export function shouldReportLead(
  lead: number,
  last: LeadReport | null,
  now: number,
  { target = READY_LEAD, waiting = false }: { target?: number; waiting?: boolean } = {},
): boolean {
  if (!last) return true;
  if (last.lead < target !== lead < target) return true;
  const since = now - last.at;
  if (waiting && since >= LEAD_REPORT_MS) return true;
  return Math.abs(lead - last.lead) >= LEAD_REPORT_STEP && since >= LEAD_REPORT_MS / 4;
}
