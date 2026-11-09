import { describe, expect, it } from "vitest";
import { byRecentUse, type Circle, CircleName, circleTitle, othersIn, seanceCircleLine } from "../src/index.ts";

const me = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const leo = { accountId: "leo", name: "Léo", color: "lilac" } as const;
const ines = { accountId: "ines", name: "Inès", color: "mint" } as const;

const circle = (id: string, overrides: Partial<Circle> = {}): Circle => ({
  id,
  members: [me, annou],
  evenings: 0,
  ...overrides,
});

describe("a circle's name", () => {
  it("is called after its people until someone names it", () => {
    expect(circleTitle(circle("c1"), "darius")).toBe("Annou et toi");
    expect(circleTitle(circle("c2", { members: [me, leo, ines] }), "darius")).toBe("Léo, Inès et toi");
    expect(circleTitle(circle("c3", { members: [me] }), "darius")).toBe("Juste toi");
    // Someone invited, not in it yet, reads its people, not « et toi ».
    expect(circleTitle(circle("c4", { members: [me, leo] }), "zoe")).toBe("Darius et Léo");
    expect(circleTitle(circle("c5", { members: [me] }), "zoe")).toBe("Darius");
  });

  it("takes the name its people gave it", () => {
    expect(circleTitle(circle("c1", { name: "Les potes du jeudi" }), "darius")).toBe("Les potes du jeudi");
  });

  it("is a short, non-empty name", () => {
    expect(CircleName.safeParse("  Nous deux  ").success).toBe(true);
    expect(CircleName.safeParse("   ").success).toBe(false);
    expect(CircleName.safeParse("x".repeat(41)).success).toBe(false);
  });
});

describe("circles", () => {
  it("know their people other than me", () => {
    expect(othersIn(circle("c1"), "darius")).toEqual([annou]);
  });

  it("come the most recently used first, never-used ones last", () => {
    const list = [circle("old", { lastUsedAt: 1 }), circle("new"), circle("recent", { lastUsedAt: 9 })];
    expect(byRecentUse(list).map((c) => c.id)).toEqual(["recent", "old", "new"]);
  });
});

describe("the salon's line about its séance's circle", () => {
  it("names a named circle, for its people and for a guest alike", () => {
    const potes = { name: "Les potes du jeudi", members: [me, annou] };
    expect(seanceCircleLine(potes, "darius")).toBe("Séance de Les potes du jeudi");
    expect(seanceCircleLine(potes, "zoe")).toBe("Séance de Les potes du jeudi");
  });

  it("says with whom for one of its people, whose séance it is for a guest", () => {
    expect(seanceCircleLine({ members: [me, leo, ines] }, "darius")).toBe("avec Léo et Inès");
    expect(seanceCircleLine({ members: [me, leo] }, "zoe")).toBe("Séance de Darius et Léo");
  });

  it("says nothing of an unnamed circle with nobody else left in it", () => {
    expect(seanceCircleLine({ members: [me] }, "darius")).toBeNull();
  });
});
