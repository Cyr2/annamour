import type { GroupSuggestion } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { matchLine, reasonLine } from "./suggestion-rules.ts";

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const leo = { accountId: "leo", name: "Léo", color: "mint" } as const;

describe("why a title is suggested", () => {
  it("names who wants it, me as « toi »", () => {
    expect(reasonLine({ kind: "wants", people: [darius] }, "darius")).toBe("Tu en as envie");
    expect(reasonLine({ kind: "wants", people: [darius, annou] }, "darius")).toBe("Toi et Annou en avez envie");
    expect(reasonLine({ kind: "wants", people: [annou] }, "darius")).toBe("Annou en a envie");
  });

  it("names who loved or liked it", () => {
    expect(reasonLine({ kind: "loved", people: [annou] }, "darius")).toBe("Annou a adoré");
    expect(reasonLine({ kind: "liked", people: [annou, leo] }, "darius")).toBe("Annou et Léo ont aimé");
    expect(reasonLine({ kind: "loved", people: [darius] }, "darius")).toBe("Tu as adoré");
  });

  it("says what it follows, the genres everyone likes, and how well rated it is", () => {
    expect(reasonLine({ kind: "because", titles: ["Gone Girl", "Seven"] }, "darius")).toBe(
      "Dans la lignée de Gone Girl et Seven",
    );
    expect(reasonLine({ kind: "genres", genres: ["thriller", "drame"] }, "darius")).toBe(
      "Thriller et drame, vos genres",
    );
    expect(reasonLine({ kind: "acclaimed", voteAverage: 8.1 }, "darius")).toBe("Très bien noté : 8,1 sur 10");
  });
});

describe("how well a suggestion suits each one", () => {
  const suggestion: GroupSuggestion = {
    title: { id: 1, type: "movie", title: "Prisoners" },
    matches: [
      { by: annou, match: 85 },
      { by: darius, match: 92 },
    ],
    reasons: [],
  };

  it("puts me first, then the others", () => {
    expect(matchLine(suggestion, "darius")).toBe("Toi 92 % · Annou 85 %");
    expect(matchLine({ ...suggestion, matches: [] }, "darius")).toBe("");
  });
});
