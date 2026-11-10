import { describe, expect, it } from "vitest";
import { passkeyWording } from "./passkey-wording.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/150.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36";

describe("what the passkey is called on this device", () => {
  it("says Face ID on an iPhone and on an iPad, even one that passes for a Mac", () => {
    expect(passkeyWording(IPHONE).enable).toBe("Activer Face ID");
    expect(passkeyWording(MAC, 5).enabled).toBe("Face ID activé");
  });

  it("says Touch ID on a Mac", () => {
    expect(passkeyWording(MAC).name).toBe("Touch ID");
    expect(passkeyWording(MAC).icon).toBe("fingerprint");
  });

  it("never mentions Face ID or Touch ID on Android or Windows", () => {
    for (const userAgent of [PIXEL, WINDOWS]) {
      const wording = passkeyWording(userAgent);
      expect(Object.values(wording).join(" ")).not.toMatch(/Face ID|Touch ID/);
      expect(wording.lede).toContain("verrouillage de l'appareil");
    }
  });
});
