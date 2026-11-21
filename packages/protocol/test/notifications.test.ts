import { describe, expect, it } from "vitest";
import {
  healthAlert,
  healthCheckDue,
  joinNames,
  PlanSeanceRequest,
  PushSubscriptionRequest,
  plannedLabel,
  reminderMessage,
  reminderStep,
} from "../src/index.ts";

const MINUTE = 60_000;
/** Saturday 21 November 2026, 21:00 in Paris (UTC+1 in winter). */
const SATURDAY_9PM = Date.UTC(2026, 10, 21, 20, 0);
/** Saturday 4 July 2026, 21:00 in Paris (UTC+2 in summer). */
const SUMMER_9PM = Date.UTC(2026, 6, 4, 19, 0);

describe("a planned evening's reminders", () => {
  it("sends nothing before 15 minutes ahead", () => {
    expect(reminderStep(SATURDAY_9PM, 0, SATURDAY_9PM - 20 * MINUTE)).toEqual({ sent: 0, expired: false });
  });

  it("sends the reminder 15 minutes ahead, then the one at the time, each once", () => {
    const early = reminderStep(SATURDAY_9PM, 0, SATURDAY_9PM - 15 * MINUTE);
    expect(early).toEqual({ sent: 1, lead: 15 * MINUTE, expired: false });
    expect(reminderStep(SATURDAY_9PM, 1, SATURDAY_9PM - 5 * MINUTE)).toEqual({ sent: 1, expired: false });
    expect(reminderStep(SATURDAY_9PM, 1, SATURDAY_9PM)).toEqual({ sent: 2, lead: 0, expired: false });
    expect(reminderStep(SATURDAY_9PM, 2, SATURDAY_9PM + MINUTE)).toEqual({ sent: 2, expired: false });
  });

  it("sends only the latest one due when the server missed the first", () => {
    expect(reminderStep(SATURDAY_9PM, 0, SATURDAY_9PM + MINUTE)).toEqual({ sent: 2, lead: 0, expired: false });
  });

  it("skips a reminder far too late, and forgets the evening hours after", () => {
    expect(reminderStep(SATURDAY_9PM, 0, SATURDAY_9PM + 45 * MINUTE)).toEqual({ sent: 2, expired: false });
    expect(reminderStep(SATURDAY_9PM, 2, SATURDAY_9PM + 3 * 60 * MINUTE)).toEqual({ sent: 2, expired: true });
  });
});

describe("a planned time, said in Paris time", () => {
  it("says tonight, today, tomorrow, a weekday, then a date", () => {
    const noon = SATURDAY_9PM - 9 * 60 * MINUTE;
    expect(plannedLabel(SATURDAY_9PM, noon)).toBe("Ce soir à 21 h");
    expect(plannedLabel(noon + 2 * 60 * MINUTE + 30 * MINUTE, noon)).toBe("Aujourd'hui à 14 h 30");
    expect(plannedLabel(SATURDAY_9PM + 24 * 60 * MINUTE + 5 * MINUTE, noon)).toBe("Demain à 21 h 05");
    expect(plannedLabel(SATURDAY_9PM + 3 * 24 * 60 * MINUTE, noon)).toBe("Mardi à 21 h");
    expect(plannedLabel(SATURDAY_9PM + 10 * 24 * 60 * MINUTE, noon)).toBe("Le 1 décembre à 21 h");
  });

  it("follows summer time", () => {
    expect(plannedLabel(SUMMER_9PM, SUMMER_9PM - 60 * MINUTE)).toBe("Ce soir à 21 h");
  });

  it("counts days in Paris, not in UTC: 0:30 on Sunday is tomorrow", () => {
    expect(plannedLabel(SATURDAY_9PM + 3.5 * 60 * MINUTE, SATURDAY_9PM)).toBe("Demain à 0 h 30");
  });
});

describe("a reminder's text", () => {
  it("names the evening, the title and the others, never assuming two people", () => {
    const base = { title: "Dune", plannedAt: SATURDAY_9PM, now: SATURDAY_9PM - 15 * MINUTE };
    expect(reminderMessage({ ...base, lead: 15 * MINUTE, others: ["Léo", "Inès"] })).toEqual({
      title: "Ce soir à 21 h : Dune",
      body: "Avec Léo et Inès",
    });
    expect(reminderMessage({ ...base, lead: 0, others: [] })).toEqual({
      title: "C'est l'heure : Dune",
      body: "Touche pour ouvrir la séance",
    });
    expect(joinNames(["Léo", "Inès", "Max"])).toBe("Léo, Inès et Max");
  });
});

describe("the catalog alert", () => {
  it("alerts once per failure, then once when it works again", () => {
    expect(healthAlert("ok", "ok")).toBeUndefined();
    expect(healthAlert("ok", "token-expired")).toContain("NAKA_TOKEN");
    expect(healthAlert("token-expired", "token-expired")).toBeUndefined();
    expect(healthAlert("token-expired", "bridge-down")).toContain("redémarre naka-bridge");
    expect(healthAlert("bridge-down", "ok")).toMatch(/^C'est revenu/);
  });

  it("checks once a day, from the chosen hour in Paris", () => {
    const sevenPm = SATURDAY_9PM - 2 * 60 * MINUTE;
    expect(healthCheckDue(undefined, sevenPm - MINUTE, 19)).toBe(false);
    expect(healthCheckDue(undefined, sevenPm, 19)).toBe(true);
    expect(healthCheckDue(sevenPm, sevenPm + 60 * MINUTE, 19)).toBe(false);
    expect(healthCheckDue(sevenPm - 2 * 60 * MINUTE, sevenPm, 19)).toBe(true);
    expect(healthCheckDue(sevenPm, sevenPm + 24 * 60 * MINUTE, 19)).toBe(true);
  });
});

describe("notification requests", () => {
  it("take only https push services and whole millisecond times", () => {
    const keys = { p256dh: "p", auth: "a" };
    expect(PushSubscriptionRequest.safeParse({ endpoint: "https://push.example/1", keys }).success).toBe(true);
    expect(PushSubscriptionRequest.safeParse({ endpoint: "http://push.example/1", keys }).success).toBe(false);
    expect(PlanSeanceRequest.safeParse({ at: 1.5 }).success).toBe(false);
  });
});
