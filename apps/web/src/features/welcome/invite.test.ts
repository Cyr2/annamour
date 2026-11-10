import type { Member } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { inviteLine, invitePeople } from "./invite.ts";

const member = (id: string, name: string): Member => ({ id, name, color: "peach", buffering: false });

describe("what a guest reads before coming in", () => {
  it("names who waits, and for what", () => {
    expect(inviteLine("Dune", [member("a", "Léo")])).toBe("Léo t'attend pour « Dune ».");
  });

  it("speaks of everyone waiting, however many they are", () => {
    const three = [member("a", "Léo"), member("b", "Inès"), member("c", "Sam")];
    expect(inviteLine("Dune", three)).toBe("Léo, Inès et Sam t'attendent pour « Dune ».");
  });

  it("keeps to the séance's title while nobody is there yet", () => {
    expect(inviteLine("Dune", [])).toBe("Une séance t'attend : « Dune ».");
  });

  it("counts someone on two devices once", () => {
    const people = invitePeople([member("a", "Léo"), member("b", "Léo"), member("c", "Inès")]);
    expect(people.map((person) => person.name)).toEqual(["Léo", "Inès"]);
  });
});
