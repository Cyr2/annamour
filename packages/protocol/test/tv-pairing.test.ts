import { describe, expect, it } from "vitest";
import {
  API,
  ApproveTvPairingRequest,
  apiPath,
  CreateTvPairingResponse,
  formatTvPairingCode,
  generateTvPairingCode,
  isTvPairingCode,
  normalizeTvPairingCode,
  TV_PAIRING_CODE_ALPHABET,
  TV_PAIRING_CODE_LENGTH,
  TvPairingStatusResponse,
} from "../src/index.ts";

describe("TV pairing code", () => {
  it("uses 6 characters without look-alikes", () => {
    expect(TV_PAIRING_CODE_LENGTH).toBe(6);
    for (const lookAlike of ["I", "L", "O", "0", "1"]) expect(TV_PAIRING_CODE_ALPHABET).not.toContain(lookAlike);
  });

  it("is drawn from the alphabet with the given random source", () => {
    expect(generateTvPairingCode(() => 0)).toBe("AAAAAA");
    const last = TV_PAIRING_CODE_ALPHABET.length - 1;
    expect(generateTvPairingCode(() => last)).toBe("999999");
    const draws = [9, 28, 12, 23, 13, 20];
    const code = generateTvPairingCode(() => draws.shift() ?? 0);
    expect(code).toBe("K7P2QX");
    expect(isTvPairingCode(code)).toBe(true);
  });

  it("is displayed with a dash in the middle", () => {
    expect(formatTvPairingCode("K7P2QX")).toBe("K7P-2QX");
  });

  it("is read however it is typed: lowercase, dash, spaces", () => {
    expect(normalizeTvPairingCode("k7p-2qx")).toBe("K7P2QX");
    expect(normalizeTvPairingCode(" K7P 2QX ")).toBe("K7P2QX");
    expect(ApproveTvPairingRequest.parse({ code: "k7p-2qx" })).toEqual({ code: "K7P2QX" });
  });

  it("rejects codes of the wrong length or with look-alikes", () => {
    expect(isTvPairingCode("K7P2Q")).toBe(false);
    expect(isTvPairingCode("K7P2QXX")).toBe(false);
    expect(isTvPairingCode("K7P2QO")).toBe(false);
    expect(ApproveTvPairingRequest.safeParse({ code: "K7P-2Q1" }).success).toBe(false);
    expect(ApproveTvPairingRequest.safeParse({}).success).toBe(false);
  });
});

describe("TV pairing contract", () => {
  it("describes the pairing handed to the TV and its status", () => {
    const pairing = { code: "K7P-2QX", pollToken: "x".repeat(43), expiresAt: 1 };
    expect(CreateTvPairingResponse.parse(pairing)).toEqual(pairing);
    expect(CreateTvPairingResponse.safeParse({ ...pairing, pollToken: "short" }).success).toBe(false);
    expect(TvPairingStatusResponse.parse({ status: "approved" })).toEqual({ status: "approved" });
    expect(TvPairingStatusResponse.safeParse({ status: "consumed" }).success).toBe(false);
  });

  it("fills path parameters, encoded", () => {
    expect(apiPath(API.tvPairingPoll, { pollToken: "abc_-1" })).toBe("/api/tv/pairing/abc_-1");
    expect(apiPath(API.tvPairingCode, { code: "K7P-2QX" })).toBe("/api/tv/pairing/code/K7P-2QX");
    expect(apiPath("/a/:b/:c", { b: "x y" })).toBe("/a/x%20y/:c");
  });
});
