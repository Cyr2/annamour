import { describe, expect, it } from "vitest";
import { isCalm } from "./reload-policy.ts";

describe("when a new version is offered", () => {
  const calm = { path: "/", sheetOpen: false, requests: 0 };

  it("is offered on a calm screen", () => {
    expect(isCalm(calm)).toBe(true);
  });

  it("waits while a séance runs, a sheet is open or a request is on its way", () => {
    expect(isCalm({ ...calm, path: "/s/YWEK" })).toBe(false);
    expect(isCalm({ ...calm, sheetOpen: true })).toBe(false);
    expect(isCalm({ ...calm, requests: 1 })).toBe(false);
  });
});
