import { describe, expect, it } from "vitest";
import { keyBytes, notificationsAvailability } from "./notifications.ts";

const device = { pushSupported: true, apple: false, installed: false, permission: "default" as const };

describe("the « Notifications » switch", () => {
  it("asks an iPhone or iPad to install the app first", () => {
    expect(notificationsAvailability({ ...device, apple: true, pushSupported: false })).toBe("install-first");
    expect(notificationsAvailability({ ...device, apple: true, installed: true })).toBe("ready");
  });

  it("says when the browser cannot, or when notifications were refused", () => {
    expect(notificationsAvailability({ ...device, pushSupported: false })).toBe("unsupported");
    expect(notificationsAvailability({ ...device, permission: "denied" })).toBe("blocked");
    expect(notificationsAvailability(device)).toBe("ready");
  });

  it("hands the server's key to the push manager as bytes", () => {
    expect([...keyBytes("AQID-_8")]).toEqual([1, 2, 3, 251, 255]);
  });
});
