import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { formatClock, formatDuration, joinNames, plural } from "./format.ts";
import { readStored, removeStored, writeStored } from "./storage.ts";

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
