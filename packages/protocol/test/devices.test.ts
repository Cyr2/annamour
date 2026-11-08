import { describe, expect, it } from "vitest";
import { deviceNames } from "../src/devices.ts";

describe("deviceNames", () => {
  it("keeps everyone's prénom when each person is on one device", () => {
    expect(
      deviceNames([
        { name: "Darius", accountId: "a" },
        { name: "Anna", accountId: "b" },
      ]),
    ).toEqual(["Darius", "Anna"]);
  });

  it("numbers the second and third devices of one account, in arrival order", () => {
    expect(
      deviceNames([
        { name: "Darius", accountId: "a" },
        { name: "Anna", accountId: "b" },
        { name: "Darius", accountId: "a" },
        { name: "Darius", accountId: "a" },
      ]),
    ).toEqual(["Darius", "Anna", "Darius (2)", "Darius (3)"]);
  });

  it("never numbers guests, even two with the same prénom", () => {
    expect(deviceNames([{ name: "Léo" }, { name: "Léo" }])).toEqual(["Léo", "Léo"]);
  });
});
