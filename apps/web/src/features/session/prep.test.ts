import { describe, expect, it } from "vitest";
import { prepProgress, prepReady } from "./prep.ts";

describe("the film's preparation, as the salon shows it", () => {
  it("is under way until a minute is ready from where the séance is", () => {
    const halfway = { available: true, readySeconds: 30, targetSeconds: 60 };
    expect(prepReady(halfway)).toBe(false);
    expect(prepProgress(halfway)).toBe(0.5);
  });

  it("is done once the minute is there", () => {
    const done = { available: true, readySeconds: 60, targetSeconds: 60 };
    expect(prepReady(done)).toBe(true);
    expect(prepProgress(done)).toBe(1);
  });

  it("has nothing to wait for when the film needs no lighter qualities", () => {
    expect(prepReady({ available: false, readySeconds: 0, targetSeconds: 60 })).toBe(true);
  });

  it("starts from nothing when there is nothing to prepare yet", () => {
    expect(prepProgress({ available: true, readySeconds: 0, targetSeconds: 0 })).toBe(1);
    expect(prepProgress({ available: true, readySeconds: 0, targetSeconds: 60 })).toBe(0);
  });
});
