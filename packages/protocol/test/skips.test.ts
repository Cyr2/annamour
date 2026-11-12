import { describe, expect, it } from "vitest";
import {
  ClientMessage,
  chooseSkips,
  inCredits,
  inIntro,
  nearEndWithoutCredits,
  type SourceMarkers,
} from "../src/index.ts";

const theIntroDb: SourceMarkers = {
  source: "theintrodb",
  confidence: 0.7,
  introStart: 228.7,
  introEnd: 246.5,
  creditsStart: 3432.8,
  referenceDuration: 3500.2,
};
const skipDb: SourceMarkers = {
  source: "skipdb",
  confidence: 0.9,
  introStart: 229.5,
  introEnd: 246.5,
  creditsStart: 3434,
};

describe("where the intro and the credits are", () => {
  it("are taken from the most trusted source that fits our copy", () => {
    expect(chooseSkips([theIntroDb, skipDb], 3500)).toEqual({ introStart: 229.5, introEnd: 246.5, creditsStart: 3434 });
  });

  it("leave out times taken on another cut of the film", () => {
    expect(chooseSkips([theIntroDb], 3530)).toBeUndefined();
    expect(chooseSkips([{ ...theIntroDb, referenceDuration: undefined }], 3530)).toMatchObject({ introEnd: 246.5 });
  });

  it("leave out what cannot be an intro or credits, and what is too unsure", () => {
    expect(chooseSkips([{ source: "x", confidence: 0.9, introEnd: 2, creditsStart: 3499 }], 3500)).toBeUndefined();
    expect(chooseSkips([{ ...skipDb, confidence: 0.3 }], 3500)).toBeUndefined();
    expect(chooseSkips([{ source: "x", confidence: 0.9, creditsStart: 100 }], undefined)).toBeUndefined();
  });

  it("take each from its own source: an intro here, the credits there", () => {
    const introOnly = { source: "a", confidence: 0.95, introEnd: 38 };
    const creditsOnly = { source: "b", confidence: 0.6, creditsStart: 8455 };
    expect(chooseSkips([introOnly, creditsOnly], 8888)).toEqual({ introStart: 0, introEnd: 38, creditsStart: 8455 });
  });
});

describe("what the player offers, and when", () => {
  const skips = { introStart: 229.5, introEnd: 246.5, creditsStart: 3434 };

  it("offers « Passer l'intro » while it plays, not in its last seconds", () => {
    expect(inIntro(skips, 230)).toBe(true);
    expect(inIntro(skips, 245)).toBe(false);
    expect(inIntro(skips, 100)).toBe(false);
    expect(inIntro(undefined, 230)).toBe(false);
  });

  it("knows when the credits roll, and the last stretch of a video whose credits are unknown", () => {
    expect(inCredits(skips, 3440)).toBe(true);
    expect(inCredits(skips, 3000)).toBe(false);
    expect(nearEndWithoutCredits({}, 3450, 3500)).toBe(true);
    expect(nearEndWithoutCredits(skips, 3450, 3500)).toBe(false);
    expect(nearEndWithoutCredits(undefined, 3000, 3500)).toBe(false);
    expect(nearEndWithoutCredits(undefined, 3450, undefined)).toBe(false);
  });

  it("lets a device say the credits started", () => {
    expect(ClientMessage.safeParse({ type: "credits", episode: 0 }).success).toBe(true);
  });
});
