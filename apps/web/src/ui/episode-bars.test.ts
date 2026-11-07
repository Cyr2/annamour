import { describe, expect, it } from "vitest";
import { barState } from "./EpisodeBars.tsx";

describe("episode bars", () => {
  it("tick the episodes before the one on screen, fill that one, leave the rest empty", () => {
    expect([0, 1, 2, 3].map((index) => barState(index, 2, false))).toEqual([
      "watched",
      "watched",
      "current",
      "upcoming",
    ]);
  });

  it("tick the last episode too once it is watched to the credits, not leave it half pink", () => {
    // AXNA: four episodes, stopped ten seconds before the end of the fourth.
    expect([0, 1, 2, 3].map((index) => barState(index, 3, true))).toEqual(["watched", "watched", "watched", "watched"]);
  });
});
