import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "../src/messages.ts";
import {
  awaitedLeads,
  forgottenLead,
  isReady,
  LEAD_REPORT_MS,
  LEAD_STUCK_MS,
  nextLead,
  READY_LEAD,
  READY_MAX_WAIT_MS,
  readyingFrom,
  readyTarget,
  readyToStart,
  shouldReportLead,
} from "../src/readying.ts";

describe("the lead each device needs before starting together", () => {
  it("is half a minute, or what is left of the film near its end", () => {
    expect(readyTarget(0, 3600)).toBe(READY_LEAD);
    expect(readyTarget(0, undefined)).toBe(READY_LEAD);
    expect(readyTarget(3590, 3600)).toBeCloseTo(9.5);
    expect(readyTarget(3600, 3600)).toBe(0);
  });
});

describe("a device is ready", () => {
  const now = 100_000;
  it("once it has the lead", () => {
    expect(isReady({ seconds: 30, grewAt: now }, 30, now)).toBe(true);
    expect(isReady({ seconds: 12, grewAt: now }, 30, now)).toBe(false);
  });

  it("when its lead stopped growing: it is not downloading, waiting for it is pointless", () => {
    expect(isReady({ seconds: 0, grewAt: now - LEAD_STUCK_MS }, 30, now)).toBe(true);
    expect(isReady({ seconds: 0, grewAt: now - LEAD_STUCK_MS + 1 }, 30, now)).toBe(false);
  });

  it("when it never says (an older app): it never holds the start", () => {
    expect(isReady(undefined, 30, now)).toBe(true);
  });
});

describe("starting together", () => {
  const readying = { target: 30, until: 25_000 };
  it("waits for a device still downloading its lead", () => {
    expect(readyToStart([undefined, { seconds: 10, grewAt: 9000 }], readying, 10_000)).toBe(false);
    expect(readyToStart([undefined, { seconds: 30, grewAt: 9000 }], readying, 10_000)).toBe(true);
  });

  it("never waits past its deadline", () => {
    expect(readyToStart([{ seconds: 10, grewAt: 24_999 }], readying, 25_000)).toBe(true);
  });

  it("only moves a lead's growth time when it actually grew", () => {
    const first = nextLead(undefined, 4, 1000);
    expect(first).toEqual({ seconds: 4, grewAt: 1000 });
    expect(nextLead(first, 4.2, 3000)).toEqual({ seconds: 4.2, grewAt: 1000 });
    expect(nextLead(first, 9, 3000)).toEqual({ seconds: 9, grewAt: 3000 });
  });
});

describe("who the room waits for", () => {
  const slow = { seconds: 5, grewAt: 1000 };

  it("never a device whose link is down: it may never come back, and its last word is stale", () => {
    expect(awaitedLeads([{ lead: slow, linkDown: true }])).toEqual([undefined]);
    expect(readyToStart(awaitedLeads([{ lead: slow, linkDown: true }]), { target: 30, until: 25_000 }, 1500)).toBe(
      true,
    );
  });

  it("a connected device, with what it last said", () => {
    expect(
      awaitedLeads([
        { lead: slow, linkDown: false },
        { lead: undefined, linkDown: false },
      ]),
    ).toEqual([slow, undefined]);
  });
});

describe("whether to wait before playing", () => {
  it("waits from where the film starts, for at most the deadline, when someone is still downloading", () => {
    expect(readyingFrom([{ seconds: 0, grewAt: 1000 }], 600, 3600, 1000)).toEqual({
      target: READY_LEAD,
      until: 1000 + READY_MAX_WAIT_MS,
    });
  });

  it("does not wait at all when everyone already has the lead, or when nobody reports one", () => {
    expect(readyingFrom([{ seconds: 40, grewAt: 0 }, undefined], 600, 3600, 1000)).toBeNull();
    expect(readyingFrom([undefined, undefined], 600, 3600, 1000)).toBeNull();
  });

  it("does not wait at the very end of the film: there is nothing left to download", () => {
    expect(readyingFrom([{ seconds: 0, grewAt: 1000 }], 3600, 3600, 1000)).toBeNull();
  });

  it("after a jump, waits again for every device that reports its lead, and only those", () => {
    expect(forgottenLead({ seconds: 300, grewAt: 0 }, 5000)).toEqual({ seconds: 0, grewAt: 5000 });
    expect(forgottenLead(undefined, 5000)).toBeUndefined();
  });
});

describe("a device telling the room its lead", () => {
  it("says it at once the first time, and when it crosses the target", () => {
    expect(shouldReportLead(3, null, 0)).toBe(true);
    expect(shouldReportLead(31, { lead: 29.5, at: 0 }, 100)).toBe(true);
  });

  it("stays quiet on tiny or too frequent changes", () => {
    expect(shouldReportLead(3.4, { lead: 3, at: 0 }, 5000)).toBe(false);
    expect(shouldReportLead(6, { lead: 3, at: 0 }, 100)).toBe(false);
    expect(shouldReportLead(6, { lead: 3, at: 0 }, LEAD_REPORT_MS / 4)).toBe(true);
  });

  it("keeps saying it while the room waits, so the room notices its deadline", () => {
    expect(shouldReportLead(3, { lead: 3, at: 0 }, LEAD_REPORT_MS, { waiting: true })).toBe(true);
    expect(shouldReportLead(3, { lead: 3, at: 0 }, LEAD_REPORT_MS)).toBe(false);
  });
});

describe("the messages of starting together", () => {
  it("accepts a lead, refuses nonsense", () => {
    expect(parseClientMessage('{"type":"lead","seconds":12.5}')).toEqual({ type: "lead", seconds: 12.5 });
    expect(parseClientMessage('{"type":"lead","seconds":-1}')).toBeNull();
    expect(parseClientMessage('{"type":"lead"}')).toBeNull();
  });

  it("carries the room's wait, and its end", () => {
    expect(parseServerMessage('{"type":"readying","readying":{"target":30,"until":5}}')).toEqual({
      type: "readying",
      readying: { target: 30, until: 5 },
    });
    expect(parseServerMessage('{"type":"readying","readying":null}')).toEqual({ type: "readying", readying: null });
  });
});
