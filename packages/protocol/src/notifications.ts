import { z } from "zod/mini";

/*
 * Notifications (Web Push): a reminder before a planned evening, to everyone
 * of the séance, and an alert to the server's keepers when the catalog fails.
 * Every hour here is Paris time: the evenings happen there, whatever the
 * server's own clock says.
 */

export const PARIS = "Europe/Paris";

/** A device's push subscription, as `PushSubscription.toJSON()` gives it. */
export const PushSubscriptionRequest = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  keys: z.object({ p256dh: z.string().check(z.minLength(1)), auth: z.string().check(z.minLength(1)) }),
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequest>;
export const PushUnsubscribeRequest = z.object({ endpoint: z.url({ protocol: /^https$/ }) });
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeRequest>;

/** The server's VAPID public key; absent when the server sends no notifications. */
export const PushKeyResponse = z.object({ publicKey: z.optional(z.string()) });
export type PushKeyResponse = z.infer<typeof PushKeyResponse>;

/** What a notification carries to the service worker; `url` is opened when it is touched. */
export const PushPayload = z.object({ title: z.string(), body: z.string(), url: z.string(), tag: z.string() });
export type PushPayload = z.infer<typeof PushPayload>;

/** An evening is planned at most this far ahead. */
export const PLAN_MAX_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;
export const PlanSeanceRequest = z.object({ at: z.int().check(z.positive()) });
export type PlanSeanceRequest = z.infer<typeof PlanSeanceRequest>;

export const PUSH_API = {
  key: "/api/push/key",
  /** POST subscribes this device, DELETE unsubscribes it. */
  subscription: "/api/me/push",
  /** PUT plans the séance's evening, DELETE cancels it. */
  plan: "/api/me/sessions/:code/plan",
} as const;

const MINUTE_MS = 60 * 1000;
/** Reminders before the planned time, in order: 15 minutes before, then at the time. */
export const REMINDER_LEADS_MS: readonly number[] = [15 * MINUTE_MS, 0];
/** A reminder this late (the server was down) says nothing useful any more: it is skipped. */
const REMINDER_TOO_LATE_MS = 30 * MINUTE_MS;
/** A planned evening still shows this long after its time, then it is forgotten. */
export const PLAN_KEPT_AFTER_MS = 3 * 60 * MINUTE_MS;

export interface ReminderStep {
  /** How many reminders are behind it now. */
  sent: number;
  /** The lead of the reminder to send now, if one is due. */
  lead?: number;
  /** The evening is past: forget it. */
  expired: boolean;
}

/**
 * Where a planned evening's reminders stand at `now`, `sent` of them already
 * sent. Only the latest one due is sent: after a restart, two at once would
 * say the same thing twice.
 */
export function reminderStep(plannedAt: number, sent: number, now: number): ReminderStep {
  if (now >= plannedAt + PLAN_KEPT_AFTER_MS) return { sent, expired: true };
  let due = sent;
  for (const [index, lead] of REMINDER_LEADS_MS.entries()) {
    if (index >= sent && now >= plannedAt - lead) due = index + 1;
  }
  const lead = REMINDER_LEADS_MS[due - 1];
  if (due === sent || lead === undefined) return { sent, expired: false };
  const tooLate = now - (plannedAt - lead) > REMINDER_TOO_LATE_MS;
  return tooLate ? { sent: due, expired: false } : { sent: due, lead, expired: false };
}

interface ParisTime {
  /** Days since 1970-01-01 in Paris: two times share it when they fall on the same Paris day. */
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  date: string;
}

const PARIS_PARTS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});
const PARIS_WEEKDAY = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long" });
const PARIS_DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "long" });

export function parisTime(at: number): ParisTime {
  const parts = Object.fromEntries(PARIS_PARTS.formatToParts(at).map((part) => [part.type, Number(part.value)]));
  const day = Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1) / (24 * 60 * MINUTE_MS);
  return {
    day,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    weekday: PARIS_WEEKDAY.format(at),
    date: PARIS_DATE.format(at),
  };
}

const EVENING_HOUR = 17;
const WEEK_DAYS = 7;

/** « Ce soir à 21 h », « Demain à 20 h 30 », « Samedi à 21 h », « Le 12 décembre à 21 h » (Paris time). */
export function plannedLabel(at: number, now: number): string {
  const when = parisTime(at);
  const days = when.day - parisTime(now).day;
  const minutes = when.minute === 0 ? "" : ` ${String(when.minute).padStart(2, "0")}`;
  const hour = `à ${when.hour} h${minutes}`;
  if (days === 0) return `${when.hour >= EVENING_HOUR ? "Ce soir" : "Aujourd'hui"} ${hour}`;
  if (days === 1) return `Demain ${hour}`;
  if (days > 1 && days < WEEK_DAYS) return `${when.weekday.charAt(0).toUpperCase()}${when.weekday.slice(1)} ${hour}`;
  return `Le ${when.date} ${hour}`;
}

/** « Léo », « Léo et Inès », « Léo, Inès et Max ». */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** The reminder one person of the séance receives; `others` are the séance's other people. */
export function reminderMessage(reminder: {
  title: string;
  plannedAt: number;
  lead: number;
  others: readonly string[];
  now: number;
}): { title: string; body: string } {
  const { title, plannedAt, lead, others, now } = reminder;
  const when = lead > 0 ? plannedLabel(plannedAt, now) : "C'est l'heure";
  return {
    title: `${when} : ${title}`,
    body: others.length > 0 ? `Avec ${joinNames(others)}` : "Touche pour ouvrir la séance",
  };
}

/** What the evening check found; anything but "ok" is a failure the keepers can fix. */
export type CatalogHealth = "ok" | "bridge-down" | "token-expired" | "captcha" | "naka-down";

const HEALTH_MESSAGES: Record<CatalogHealth, string> = {
  ok: "C'est revenu : la recherche Naka remarche.",
  "bridge-down": "Naka ne répond plus : redémarre naka-bridge dans Coolify.",
  "token-expired": "Le token Naka a expiré : mets à jour NAKA_TOKEN dans Coolify.",
  captcha: "Naka demande une vérification anti-robot : les lancements depuis la recherche échouent, colle les liens.",
  "naka-down": "La recherche Naka échoue : regarde les journaux de naka-bridge dans Coolify.",
};

/** The alert to send after a check, if any: one per failure, then one when it works again. */
export function healthAlert(previous: CatalogHealth, current: CatalogHealth): string | undefined {
  return current === previous ? undefined : HEALTH_MESSAGES[current];
}

/** The evening check is due once a day, from `hour` Paris time on. */
export function healthCheckDue(lastCheckedAt: number | undefined, now: number, hour: number): boolean {
  const today = parisTime(now);
  if (today.hour < hour) return false;
  if (lastCheckedAt === undefined) return true;
  const last = parisTime(lastCheckedAt);
  return last.day < today.day || last.hour < hour;
}
