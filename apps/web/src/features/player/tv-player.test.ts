import { describe, expect, it } from "vitest";
import { withLetter } from "../join/JoinScreen.tsx";
import { seekBadgeLabel, tvPlayerAction } from "./tv-player-keys.ts";

describe("the player with a remote", () => {
  it("plays, pauses and jumps 10 s without the bar", () => {
    expect(tvPlayerAction("ok", false)).toEqual({ kind: "toggle" });
    expect(tvPlayerAction("playPause", false)).toEqual({ kind: "toggle" });
    expect(tvPlayerAction("left", false)).toEqual({ kind: "seek", delta: -10 });
    expect(tvPlayerAction("right", false)).toEqual({ kind: "seek", delta: 10 });
  });

  it("brings the bar up with ↑ or ↓", () => {
    expect(tvPlayerAction("up", false)).toEqual({ kind: "showBar" });
    expect(tvPlayerAction("down", false)).toEqual({ kind: "showBar" });
  });

  it("leaves the arrows and OK to the bar once it shows, but play/pause still toggles", () => {
    expect(tvPlayerAction("ok", true)).toBeNull();
    expect(tvPlayerAction("left", true)).toBeNull();
    expect(tvPlayerAction("up", true)).toBeNull();
    expect(tvPlayerAction("playPause", true)).toEqual({ kind: "toggle" });
  });

  it("leaves Retour to the screen", () => {
    expect(tvPlayerAction("back", false)).toBeNull();
    expect(tvPlayerAction(null, false)).toBeNull();
  });

  it("labels the jump", () => {
    expect(seekBadgeLabel(-10)).toBe("−10 s");
    expect(seekBadgeLabel(10)).toBe("+10 s");
  });
});

describe("the on-screen keyboard", () => {
  it("types a code letter by letter, and starts over after a full one", () => {
    expect(withLetter("", "Y")).toBe("Y");
    expect(withLetter("YWE", "K")).toBe("YWEK");
    expect(withLetter("YWEK", "A")).toBe("A");
  });
});
