import { describe, expect, it } from "vitest";
import { fromPickerValue, initialPlanTime, toPickerValue } from "./plan-rules.ts";

const at = (value: string) => new Date(value).getTime();

describe("the evening's time picker", () => {
  it("offers 21 h tonight, or tomorrow once it is past, or the time already planned", () => {
    expect(toPickerValue(initialPlanTime(undefined, at("2026-11-21T15:10")))).toBe("2026-11-21T21:00");
    expect(toPickerValue(initialPlanTime(undefined, at("2026-11-21T22:00")))).toBe("2026-11-22T21:00");
    expect(toPickerValue(initialPlanTime(at("2026-11-28T20:30"), at("2026-11-21T22:00")))).toBe("2026-11-28T20:30");
  });

  it("reads back what it shows, and nothing while incomplete", () => {
    expect(fromPickerValue("2026-11-21T21:05")).toBe(at("2026-11-21T21:05"));
    expect(fromPickerValue("2026-11-21")).toBeNull();
    expect(fromPickerValue("2026-13-45T99:99")).toBeNull();
  });
});
