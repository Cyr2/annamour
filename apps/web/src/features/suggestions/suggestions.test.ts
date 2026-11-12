import { describe, expect, it } from "vitest";
import { perfectLabel, reasonLine } from "./suggestion-rules.ts";

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const anna = { accountId: "anna", name: "Anna", color: "rose" } as const;
const leo = { accountId: "leo", name: "Léo", color: "mint" } as const;

describe("why a title is suggested", () => {
  it("names who wants it, me as « toi »", () => {
    expect(reasonLine({ kind: "wants", people: [darius] }, "darius")).toBe("Tu en as envie");
    expect(reasonLine({ kind: "wants", people: [darius, anna] }, "darius")).toBe("Toi et Anna en avez envie");
    expect(reasonLine({ kind: "wants", people: [anna] }, "darius")).toBe("Anna en a envie");
  });

  it("names who loved or liked it", () => {
    expect(reasonLine({ kind: "loved", people: [anna] }, "darius")).toBe("Anna l'a adoré");
    expect(reasonLine({ kind: "liked", people: [anna, leo] }, "darius")).toBe("Anna et Léo l'ont aimé");
    expect(reasonLine({ kind: "loved", people: [darius] }, "darius")).toBe("Tu l'as adoré");
  });

  it("says what it follows, who made it, the genre that draws them, and how well rated it is", () => {
    expect(reasonLine({ kind: "because", titles: ["Gone Girl"] }, "darius")).toBe("Parce que vous avez aimé Gone Girl");
    expect(reasonLine({ kind: "director", name: "David Fincher" }, "darius")).toBe("Réalisé par David Fincher");
    expect(reasonLine({ kind: "director", name: "Moira Walley-Beckett" }, "darius", "tv")).toBe(
      "Créé par Moira Walley-Beckett",
    );
    expect(reasonLine({ kind: "genres", genres: ["thriller"] }, "darius")).toBe("Thriller, votre genre");
    expect(reasonLine({ kind: "genres", genres: ["thriller", "drame"] }, "darius")).toBe(
      "Thriller et drame, vos genres",
    );
    expect(reasonLine({ kind: "acclaimed", voteAverage: 8.1 }, "darius")).toBe("Très bien noté : 8,1 sur 10");
  });

  it("marks a title that suits everyone", () => {
    expect(perfectLabel(2)).toBe("Pile pour vous deux");
    expect(perfectLabel(4)).toBe("Pile pour vous");
  });
});
