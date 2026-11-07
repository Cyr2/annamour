import type { Member } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { filmIsOn, readyingMessage, slowestLead } from "./readying-rules.ts";

const member = (id: string, name: string, lead?: number): Member => ({
  id,
  name,
  color: "peach",
  buffering: false,
  ...(lead === undefined ? {} : { lead }),
});

const readying = { target: 30, until: 25_000 };

describe("who the film waits for before starting together", () => {
  it("is the device with the least downloaded, still short of the target", () => {
    const members = [member("m1", "Darius", 30), member("m2", "Annou", 12), member("m3", "Léo", 20)];
    expect(slowestLead(members, readying, "m1")).toMatchObject({ member: { name: "Annou" }, lead: 12, isYou: false });
  });

  it("is nobody when no wait runs, when everyone has the lead, or when nobody says", () => {
    expect(slowestLead([member("m2", "Annou", 3)], null, "m1")).toBeNull();
    expect(slowestLead([member("m2", "Annou", 31)], readying, "m1")).toBeNull();
    expect(slowestLead([member("m2", "Annou")], readying, "m1")).toBeNull();
  });

  it("keeps the film « on » for the controls while the room waits to start or to go on after a jump", () => {
    const paused = { status: "paused", position: 60, at: 0 } as const;
    expect(filmIsOn({ ...paused, status: "playing" }, null)).toBe(true);
    expect(filmIsOn(paused, readying)).toBe(true);
    expect(filmIsOn(paused, null)).toBe(false);
    expect(filmIsOn(null, null)).toBe(false);
  });

  it("is said plainly, about someone else or about this device", () => {
    const annou = { member: member("m2", "Annou", 18.7), lead: 18.7, target: 30, isYou: false };
    expect(readyingMessage(annou)).toBe("On attend que la vidéo de Annou ait un peu d'avance… 18 s / 30 s");
    expect(readyingMessage({ ...annou, isYou: true })).toBe("On attend que ta vidéo ait un peu d'avance… 18 s / 30 s");
  });
});
