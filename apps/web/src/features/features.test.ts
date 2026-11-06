import type { Member } from "@annamour/protocol";
import { describe, expect, it, vi } from "vitest";
import { safeNext, welcomePath } from "./account/AccountGate.tsx";
import { memberChanges } from "./player/member-changes.ts";
import { keyAction, type PlayerKeys } from "./player/player-keys.ts";
import { presenceOf } from "./session/Presence.tsx";
import { splitKey } from "./welcome/KeyLoginScreen.tsx";
import { tokenFromHash } from "./welcome/LinkDeviceScreen.tsx";

const member = (id: string, buffering = false): Member => ({ id, name: id.toUpperCase(), color: "mint", buffering });

describe("memberChanges", () => {
  it("reports arrivals and departures, never yourself", () => {
    const before = [member("me"), member("anna")];
    const after = [member("me"), member("leo")];
    const { joined, left } = memberChanges(before, after, "me");
    expect(joined.map((m) => m.id)).toEqual(["leo"]);
    expect(left.map((m) => m.id)).toEqual(["anna"]);
  });
});

describe("presenceOf", () => {
  it("puts me first and keeps the thread slack while alone or loading", () => {
    expect(presenceOf([member("anna"), member("me")], "me").ordered.map((m) => m.id)).toEqual(["me", "anna"]);
    expect(presenceOf([member("me")], "me").synced).toBe(false);
    expect(presenceOf([member("me"), member("anna", true)], "me").synced).toBe(false);
    expect(presenceOf([member("me"), member("anna")], "me").synced).toBe(true);
  });
});

describe("player keyboard", () => {
  it("maps keys to actions", () => {
    const keys: PlayerKeys = { toggle: vi.fn(), seekBy: vi.fn(), toggleMute: vi.fn(), fullscreen: vi.fn() };
    keyAction(" ", keys)?.();
    keyAction("ArrowLeft", keys)?.();
    keyAction("M", keys)?.();
    keyAction("f", keys)?.();
    expect(keys.toggle).toHaveBeenCalled();
    expect(keys.seekBy).toHaveBeenCalledWith(-10);
    expect(keys.toggleMute).toHaveBeenCalled();
    expect(keys.fullscreen).toHaveBeenCalled();
    expect(keyAction("x", keys)).toBeNull();
  });
});

describe("account helpers", () => {
  it("splits a pasted key whatever the separators", () => {
    expect(splitKey(" lune · panda, velours-cerise ")).toEqual(["lune", "panda", "velours", "cerise"]);
  });

  it("reads the QR token from the hash only when it is long enough", () => {
    expect(tokenFromHash("#abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(tokenFromHash("#short")).toBeNull();
  });

  it("returns only to internal pages after the first launch", () => {
    expect(safeNext("/s/YWEK")).toBe("/s/YWEK");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(welcomePath("/")).toBe("/bienvenue");
    expect(welcomePath("/s/YWEK")).toBe("/bienvenue?suite=%2Fs%2FYWEK");
  });
});
