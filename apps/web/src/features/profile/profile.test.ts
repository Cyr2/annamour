import { LINK_TOKEN_TTL_MS } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { formatCountdown, linkUrl, liveToken, secondsLeft } from "./link-countdown.ts";

describe("add-a-device QR code", () => {
  it("lives five minutes on this device's clock, whatever the server's clock says", () => {
    const link = liveToken({ token: "t".repeat(32), expiresAt: 0 }, 1_000);
    expect(link.deadline).toBe(1_000 + LINK_TOKEN_TTL_MS);
    expect(secondsLeft(link.deadline, 1_000)).toBe(300);
    expect(secondsLeft(link.deadline, 1_500)).toBe(300);
    expect(secondsLeft(link.deadline, link.deadline + 5_000)).toBe(0);
  });

  it("shows the time left as minutes and seconds", () => {
    expect(formatCountdown(299)).toBe("4:59");
    expect(formatCountdown(5)).toBe("0:05");
  });

  it("keeps the token in the hash of the link page", () => {
    expect(linkUrl("https://annamour.app", "abc")).toBe("https://annamour.app/lier#abc");
  });
});
