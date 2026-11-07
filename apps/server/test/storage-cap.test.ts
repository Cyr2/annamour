import { describe, expect, it } from "vitest";
import { formatGb, roomsToEvict } from "../src/media/storage-cap.ts";

const room = (code: string, bytes: number, lastUse: number, inUse = false) => ({ code, bytes, lastUse, inUse });

describe("the disk cap on lighter qualities", () => {
  it("deletes nothing while every séance fits", () => {
    expect(roomsToEvict([room("A", 400, 1), room("B", 400, 2)], 800)).toEqual([]);
  });

  it("deletes the séances watched longest ago first, only as many as needed", () => {
    const rooms = [room("NEW", 500, 30), room("OLD", 500, 10), room("MID", 500, 20)];
    expect(roomsToEvict(rooms, 1000)).toEqual(["OLD"]);
    expect(roomsToEvict(rooms, 400)).toEqual(["OLD", "MID", "NEW"]);
  });

  it("spares a séance being watched, even when that leaves the disk over the cap", () => {
    const rooms = [room("WATCHED", 900, 1, true), room("DONE", 300, 5)];
    expect(roomsToEvict(rooms, 500)).toEqual(["DONE"]);
    expect(roomsToEvict([room("WATCHED", 900, 1, true)], 500)).toEqual([]);
  });

  it("says sizes in gigabytes for the server log", () => {
    expect(formatGb(12_345_000_000)).toBe("12.3 GB");
    expect(formatGb(0)).toBe("0.0 GB");
  });
});
