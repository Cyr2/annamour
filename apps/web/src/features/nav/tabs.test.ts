import { describe, expect, it } from "vitest";
import { tabFor } from "./tabs.ts";

describe("tab bar", () => {
  it("follows the route on its three screens", () => {
    expect(tabFor("/")).toBe("cesoir");
    expect(tabFor("/liste")).toBe("liste");
    expect(tabFor("/nous/")).toBe("nous");
  });

  it("hides in the salon, the player, the first launch, joining by code and unknown pages", () => {
    expect(tabFor("/s/ABCD")).toBeNull();
    expect(tabFor("/bienvenue")).toBeNull();
    expect(tabFor("/cle")).toBeNull();
    expect(tabFor("/rejoindre")).toBeNull();
    expect(tabFor("/nulle-part")).toBeNull();
  });
});
