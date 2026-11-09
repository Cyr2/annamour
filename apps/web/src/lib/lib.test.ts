import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/mini";
import { formatBytes, formatClock, formatDuration, joinNames, plural } from "./format.ts";
import { isNewPage } from "./page-scroll.ts";
import { canReloadNow } from "./reload-policy.ts";
import { readStored, removeStored, writeStored } from "./storage.ts";
import { visibleArea } from "./visible-area.ts";

describe("formatBytes", () => {
  it("speaks in Go for a film and in Mo below", () => {
    expect(formatBytes(3_804_000_000)).toBe("3,8 Go");
    expect(formatBytes(420_400_000)).toBe("420 Mo");
  });
});

describe("formatting", () => {
  it("shows a film clock with hours", () => {
    expect(formatClock(4360)).toBe("1:12:40");
    expect(formatClock(59.9)).toBe("0:00:59");
    expect(formatClock(Number.NaN)).toBe("0:00:00");
    expect(formatClock(-4)).toBe("0:00:00");
  });

  it("rounds durations to the minute", () => {
    expect(formatDuration(7826)).toBe("2 h 10");
    expect(formatDuration(2520)).toBe("42 min");
    expect(formatDuration(3600)).toBe("1 h 00");
  });

  it("joins names the French way, for any number of people", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Anna"])).toBe("Anna");
    expect(joinNames(["Anna", "Léo"])).toBe("Anna et Léo");
    expect(joinNames(["Anna", "Léo", "Inès"])).toBe("Anna, Léo et Inès");
  });

  it("pluralises", () => {
    expect(plural(1, "séance")).toBe("1 séance");
    expect(plural(3, "séance")).toBe("3 séances");
  });
});

describe("storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips values and validates them on the way back", () => {
    writeStored("k", { n: 1 });
    expect(readStored("k", z.object({ n: z.number() }))).toEqual({ n: 1 });
    expect(readStored("k", z.object({ n: z.string() }))).toBeNull();
    removeStored("k");
    expect(readStored("k", z.object({ n: z.number() }))).toBeNull();
  });

  it("survives corrupt values and a storage that throws", () => {
    localStorage.setItem("k", "{oops");
    expect(readStored("k", z.unknown())).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeStored("k", 1)).not.toThrow();
    expect(() => removeStored("k")).not.toThrow();
  });
});

describe("updating the installed app", () => {
  it("switches to a new version anywhere but in a séance, never cutting a film", () => {
    expect(canReloadNow("/")).toBe(true);
    expect(canReloadNow("/a-regarder")).toBe(true);
    expect(canReloadNow("/s/ABCD")).toBe(false);
  });
});

describe("a sheet over the on-screen keyboard", () => {
  it("sits in the area the keyboard leaves visible", () => {
    expect(visibleArea(844, { height: 508, offsetTop: 0 })).toEqual({ top: 0, height: 508 });
    expect(visibleArea(844, { height: 508, offsetTop: 40 })).toEqual({ top: 40, height: 508 });
  });

  it("does nothing without a keyboard, or where the page already shrank (Android)", () => {
    expect(visibleArea(844, { height: 844, offsetTop: 0 })).toBeNull();
    expect(visibleArea(844, { height: 843, offsetTop: 0 })).toBeNull();
    expect(visibleArea(844, null)).toBeNull();
  });
});

describe("isNewPage", () => {
  it("starts another page at its top, but not another tab of the same page", () => {
    expect(isNewPage("/nous", "/liste")).toBe(true);
    expect(isNewPage("/liste", "/liste")).toBe(false);
  });
});
