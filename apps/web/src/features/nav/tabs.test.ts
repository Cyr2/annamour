import { describe, expect, it } from "vitest";
import { tabFor } from "./tabs.ts";

describe("tab bar", () => {
  it("follows the route on the classic interface's four screens", () => {
    expect(tabFor("/a-regarder")).toBe("aregarder");
    expect(tabFor("/")).toBe("accueil");
    expect(tabFor("/rejoindre")).toBe("rejoindre");
    expect(tabFor("/profil/")).toBe("profil");
  });

  it("follows the route on the circles interface's three screens, where joining has no tab", () => {
    expect(tabFor("/", true)).toBe("cesoir");
    expect(tabFor("/liste", true)).toBe("liste");
    expect(tabFor("/nous/", true)).toBe("nous");
    expect(tabFor("/rejoindre", true)).toBeNull();
  });

  it("hides in the salon, the player, the first launch and unknown pages", () => {
    for (const circles of [false, true]) {
      expect(tabFor("/s/ABCD", circles)).toBeNull();
      expect(tabFor("/bienvenue", circles)).toBeNull();
      expect(tabFor("/cle", circles)).toBeNull();
      expect(tabFor("/nulle-part", circles)).toBeNull();
    }
  });
});
