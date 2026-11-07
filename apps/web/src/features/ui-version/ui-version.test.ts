import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("the interface a device shows", () => {
  it("is the classic one until someone tries the new one", async () => {
    const { useUiVersion, circleUiNow } = await import("./ui-version.ts");
    expect(useUiVersion.getState().version).toBe("classic");
    expect(circleUiNow()).toBe(false);
  });

  it("stays the one picked after a reload, on this device", async () => {
    const first = await import("./ui-version.ts");
    first.setUiVersion("circles");
    expect(first.circleUiNow()).toBe(true);
    vi.resetModules();
    const reloaded = await import("./ui-version.ts");
    expect(reloaded.useUiVersion.getState().version).toBe("circles");
  });

  it("ignores a stored value it does not know", async () => {
    localStorage.setItem("annamour.interface", JSON.stringify("autre"));
    const { useUiVersion } = await import("./ui-version.ts");
    expect(useUiVersion.getState().version).toBe("classic");
  });

  it("sends each interface's list to its own page", async () => {
    const { listPath } = await import("./ui-version.ts");
    expect(listPath(true)).toBe("/liste");
    expect(listPath(false)).toBe("/a-regarder");
  });
});
