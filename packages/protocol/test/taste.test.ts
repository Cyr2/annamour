import { describe, expect, it } from "vitest";
import {
  affinity,
  featuresOf,
  GroupSuggestion,
  groupScore,
  mergeCandidates,
  quality,
  rankForGroup,
  similarity,
  type TasteCandidate,
  type TasteTitle,
  TitleDetailsQuery,
  tasteProfile,
} from "../src/index.ts";

// TMDB genres: 53 thriller, 18 drame, 35 comédie, 10749 romance, 27 horreur, 878 science-fiction.
const title = (key: string, genres: number[], extra: Partial<TasteTitle> = {}): TasteTitle => ({
  key,
  genres,
  ...extra,
});
const THRILLER = title("movie:1", [53, 18], { year: 2025, language: "en", voteAverage: 7.2, voteCount: 900 });
const ROMCOM = title("movie:2", [35, 10749], { year: 2004, language: "en" });
const HORROR = title("movie:3", [27], { year: 2019, language: "en" });
const candidate = (taste: TasteTitle, seeds: string[] = [], wantedBy: string[] = []): TasteCandidate => ({
  title: taste,
  seeds,
  wantedBy,
});

describe("a taste", () => {
  it("is made of genres, the decade and the language", () => {
    expect([...featuresOf(THRILLER).keys()]).toEqual(["g:53", "g:18", "d:2020", "l:en"]);
  });

  it("leans to what was loved and away from what was not liked", () => {
    const darius = tasteProfile([
      { title: THRILLER, signal: "loved" },
      { title: HORROR, signal: "disliked" },
    ]);
    expect(affinity(darius, title("x", [53]))).toBeGreaterThan(0.5);
    expect(affinity(darius, title("y", [27]))).toBeLessThan(0);
    expect(affinity(new Map(), THRILLER)).toBe(0);
  });

  it("trusts a rating with many votes, and pulls a rating with few to the usual one", () => {
    expect(quality({ voteAverage: 9, voteCount: 20000 })).toBeCloseTo(0.9, 2);
    expect(quality({ voteAverage: 9, voteCount: 2 })).toBeCloseTo(0.65, 1);
    expect(quality({})).toBeCloseTo(0.65, 2);
  });

  it("scores the group so that nobody is left out", () => {
    expect(groupScore([0.9, 0.9])).toBeCloseTo(0.9);
    expect(groupScore([1, 0.2])).toBeLessThan(groupScore([0.65, 0.6]));
    expect(groupScore([])).toBe(0);
  });
});

describe("the group's suggestions", () => {
  const darius = { accountId: "darius", profile: tasteProfile([{ title: THRILLER, signal: "loved" }]) };
  const anna = {
    accountId: "anna",
    profile: tasteProfile([
      { title: THRILLER, signal: "liked" },
      { title: ROMCOM, signal: "loved" },
    ]),
  };

  it("puts first what suits both, with each one's match and the genres they share", () => {
    const ranked = rankForGroup(
      [darius, anna],
      [candidate(title("movie:10", [27])), candidate(title("movie:11", [53, 18], { year: 2024 }), ["movie:1"])],
      new Set(),
      5,
    );
    expect(ranked[0]?.key).toBe("movie:11");
    expect(ranked[0]?.sharedGenres).toEqual([53, 18]);
    expect(ranked[0]?.matches.map((m) => m.accountId)).toEqual(["darius", "anna"]);
    expect(ranked[0]?.matches.every((m) => m.match > 50 && m.match <= 100)).toBe(true);
    expect(ranked[0]?.seeds).toEqual(["movie:1"]);
  });

  it("lifts what someone wants, and leaves out what was excluded", () => {
    const wanted = candidate(title("movie:20", [27]), [], ["anna"]);
    const plain = candidate(title("movie:21", [27]));
    const [first] = rankForGroup([darius, anna], [plain, wanted], new Set(), 2);
    expect(first?.key).toBe("movie:20");
    expect(rankForGroup([darius, anna], [wanted], new Set(["movie:20"]), 2)).toEqual([]);
    expect(rankForGroup([], [wanted], new Set(), 2)).toEqual([]);
  });

  it("varies the pick rather than lining up the same kind of title", () => {
    const thrillers = [30, 31, 32].map((id) => candidate(title(`movie:${id}`, [53, 18], { year: 2020 })));
    const comedy = candidate(title("movie:40", [35, 10749], { year: 2020 }));
    const keys = rankForGroup([darius, anna], [...thrillers, comedy], new Set(), 2).map((r) => r.key);
    expect(keys).toContain("movie:40");
    expect(similarity(THRILLER, THRILLER)).toBeCloseTo(1);
    expect(similarity(THRILLER, title("z", [35]))).toBe(0);
  });

  it("merges a title met from several seeds and in the list", () => {
    const merged = mergeCandidates([
      candidate(THRILLER, ["movie:9"]),
      candidate(THRILLER, ["movie:8", "movie:9"], ["anna"]),
      candidate(HORROR),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ seeds: ["movie:9", "movie:8"], wantedBy: ["anna"] });
  });
});

describe("what the server sends", () => {
  it("reads a title's details query from the address", () => {
    expect(TitleDetailsQuery.parse({ type: "movie", title: "Verity", year: "2025", tmdbId: "12" })).toEqual({
      type: "movie",
      title: "Verity",
      year: 2025,
      tmdbId: 12,
    });
  });

  it("says why a suggestion is there", () => {
    const parsed = GroupSuggestion.safeParse({
      title: { id: 1, type: "movie", title: "Verity" },
      matches: [{ by: { accountId: "a", name: "Anna", color: "rose" }, match: 92 }],
      reasons: [
        { kind: "because", titles: ["Gone Girl"] },
        { kind: "acclaimed", voteAverage: 8.1 },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
