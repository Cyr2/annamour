import { describe, expect, it } from "vitest";
import { tabFor } from "./tabs.ts";

describe("tab bar", () => {
  it("follows the route on its four screens", () => {
    expect(tabFor("/a-regarder")).toBe("aregarder");
    expect(tabFor("/")).toBe("accueil");
    expect(tabFor("/rejoindre")).toBe("rejoindre");
    expect(tabFor("/profil/")).toBe("profil");
  });

  it("hides in the salon, the player, the first launch and unknown pages", () => {
    expect(tabFor("/s/ABCD")).toBeNull();
    expect(tabFor("/bienvenue")).toBeNull();
    expect(tabFor("/cle")).toBeNull();
    expect(tabFor("/nulle-part")).toBeNull();
  });
});
