import { describe, expect, it } from "vitest";
import {
  affinity,
  DismissSuggestionRequest,
  featuresOf,
  GroupSuggestion,
  groupScore,
  keywordIdf,
  mergeCandidates,
  preRank,
  quality,
  rankForGroup,
  similarity,
  type TasteTitle,
  TitleDetailsQuery,
  tasteProfile,
} from "../src/index.ts";

// TMDB genres: 53 thriller, 18 drame, 35 comédie, 10749 romance, 27 horreur. Keywords: 1 « twist », 2 « marriage ».
const film = (key: string, genres: number[], extra: Partial<TasteTitle> = {}): TasteTitle => ({
  key,
  kind: "movie",
  genres,
  ...extra,
});
const GONE_GIRL = film("movie:1", [53, 18], {
  keywords: [1, 2],
  directors: [7467],
  cast: [880, 10882],
  year: 2014,
  language: "en",
  voteAverage: 7.9,
  voteCount: 19000,
});
const ROMCOM = film("movie:2", [35, 10749], { year: 2004, language: "en", keywords: [2] });
const HORROR = film("movie:3", [27], { year: 2019, language: "en" });
const candidate = (title: TasteTitle, seeds: { key: string; weight: number }[] = [], wantedBy: string[] = []) => ({
  title,
  seeds,
  wantedBy,
});

describe("what a title is made of", () => {
  it("has families of features, each weighted, keywords weighed by how rare they are", () => {
    const features = featuresOf(GONE_GIRL, new Map([[1, 3]]));
    expect([...features.keys()]).toEqual([
      "k:1",
      "k:2",
      "g:53",
      "g:18",
      "p:7467",
      "c:880",
      "c:10882",
      "l:en",
      "d:2010",
      "t:movie",
    ]);
    expect(features.get("k:1")).toBeGreaterThan(features.get("k:2") ?? 0);
    expect(features.get("p:7467")).toBeCloseTo(0.6);
    expect(keywordIdf([GONE_GIRL, ROMCOM]).get(2)).toBeLessThan(keywordIdf([GONE_GIRL, ROMCOM]).get(1) ?? 0);
  });
});

describe("a taste", () => {
  const many = (title: TasteTitle, n: number) => Array.from({ length: n }, () => ({ title, signal: "loved" as const }));

  it("leans to what was loved, and is put off apart by what was not liked", () => {
    const taste = tasteProfile([...many(GONE_GIRL, 20), { title: HORROR, signal: "disliked" }]);
    expect(affinity(taste, film("x", [53, 18], { directors: [7467] }))).toBeGreaterThan(0.6);
    expect(affinity(taste, film("y", [27]))).toBeLessThan(0.5);
  });

  it("stays cautious while little was said, and says « neither » with nothing", () => {
    const fewSaid = affinity(tasteProfile(many(GONE_GIRL, 1)), film("x", [53, 18]));
    const muchSaid = affinity(tasteProfile(many(GONE_GIRL, 30)), film("x", [53, 18]));
    expect(fewSaid).toBeLessThan(muchSaid);
    expect(affinity(tasteProfile([]), GONE_GIRL)).toBe(0.5);
  });

  it("forgets old wishes faster than old avis", () => {
    const wishOld = tasteProfile([
      { title: GONE_GIRL, signal: "wants", ageDays: 365 },
      { title: ROMCOM, signal: "wants" },
    ]);
    expect(wishOld.positive.get("g:35") ?? 0).toBeGreaterThan(wishOld.positive.get("g:53") ?? 0);
    const avisOld = tasteProfile([
      { title: GONE_GIRL, signal: "liked", ageDays: 365 },
      { title: ROMCOM, signal: "liked" },
    ]);
    expect((avisOld.positive.get("g:53") ?? 0) / (avisOld.positive.get("g:35") ?? 1)).toBeGreaterThan(0.6);
  });

  it("trusts a rating with many votes, series needing fewer", () => {
    expect(quality(film("a", [], { voteAverage: 9, voteCount: 20000 }))).toBeCloseTo(0.9, 2);
    expect(quality(film("a", [], { voteAverage: 9, voteCount: 2 }))).toBeCloseTo(0.65, 1);
    const series = { ...film("s", [], { voteAverage: 9, voteCount: 200 }), kind: "tv" as const };
    expect(quality(series)).toBeGreaterThan(quality(film("f", [], { voteAverage: 9, voteCount: 200 })));
  });

  it("scores the group with a veto, and makes disagreement cost", () => {
    expect(groupScore([0.8, 0.8])).toBeCloseTo(0.8);
    expect(groupScore([0.9, 0.5])).toBeCloseTo(0.5);
    expect(groupScore([0.95, 0.25])).toBeNull();
    expect(groupScore([])).toBeNull();
  });
});

describe("the group's suggestions", () => {
  const loves = (title: TasteTitle, n = 10) => Array.from({ length: n }, () => ({ title, signal: "loved" as const }));
  const darius = { accountId: "darius", profile: tasteProfile(loves(GONE_GIRL)) };
  const anna = { accountId: "anna", profile: tasteProfile([...loves(GONE_GIRL, 6), ...loves(ROMCOM, 6)]) };
  const thriller = film("movie:11", [53, 18], { directors: [7467], voteAverage: 8, voteCount: 5000 });

  it("puts first what suits both, says what draws them, and marks a title that suits both well", () => {
    const ranked = rankForGroup(
      [darius, anna],
      [candidate(film("movie:10", [27])), candidate(thriller, [{ key: "movie:1", weight: 6 }])],
      new Set(),
      5,
    );
    expect(ranked[0]).toMatchObject({ key: "movie:11", seeds: ["movie:1"] });
    expect(ranked[0]?.strongest).toMatch(/^(p|g):/);
    expect(ranked[0]?.matches.map((m) => m.accountId)).toEqual(["darius", "anna"]);
    expect(typeof ranked[0]?.perfect).toBe("boolean");
  });

  it("lifts what someone wants, and leaves out the excluded", () => {
    const wanted = candidate(film("movie:20", [53]), [], ["anna"]);
    const plain = candidate(film("movie:21", [53]));
    expect(rankForGroup([darius, anna], [plain, wanted], new Set(), 2)[0]?.key).toBe("movie:20");
    expect(rankForGroup([darius, anna], [wanted], new Set(["movie:20"]), 2)).toEqual([]);
    expect(rankForGroup([], [wanted], new Set(), 2)).toEqual([]);
  });

  it("leaves out what one of them would sit through for the other", () => {
    const hates = {
      accountId: "léo",
      profile: tasteProfile(Array.from({ length: 30 }, () => ({ title: thriller, signal: "disliked" as const }))),
    };
    expect(rankForGroup([darius, hates], [candidate(thriller)], new Set(), 5)).toEqual([]);
  });

  it("varies the pick, one title per saga", () => {
    const sequel = (key: string) => candidate(film(key, [53, 18], { collection: 99, voteAverage: 8, voteCount: 5000 }));
    const comedy = candidate(film("movie:40", [35, 10749], { voteAverage: 7, voteCount: 5000 }));
    const keys = rankForGroup([darius, anna], [sequel("movie:30"), sequel("movie:31"), comedy], new Set(), 3).map(
      (r) => r.key,
    );
    expect(keys.filter((key) => key === "movie:30" || key === "movie:31")).toHaveLength(1);
    expect(similarity(film("a", [1], { collection: 5 }), film("b", [2], { collection: 5 }))).toBe(1);
    expect(similarity(GONE_GIRL, film("z", [35]))).toBe(0);
  });

  it("first sorts many rough candidates cheaply, without veto", () => {
    const rough = [candidate(film("movie:50", [27])), candidate(film("movie:51", [53, 18]))];
    expect(preRank([darius, anna], rough, new Set(["movie:50"]), 5).map((c) => c.title.key)).toEqual(["movie:51"]);
  });

  it("merges a title met from several seeds and in the list, keeping each seed's strongest weight", () => {
    const merged = mergeCandidates([
      candidate(GONE_GIRL, [{ key: "movie:9", weight: 1 }]),
      candidate(
        GONE_GIRL,
        [
          { key: "movie:9", weight: 3 },
          { key: "movie:8", weight: 2 },
        ],
        ["anna"],
      ),
      candidate(HORROR),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      seeds: [
        { key: "movie:9", weight: 3 },
        { key: "movie:8", weight: 2 },
      ],
      wantedBy: ["anna"],
    });
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

  it("says why a suggestion is there, and whether it suits everyone", () => {
    const parsed = GroupSuggestion.safeParse({
      title: { id: 1, type: "movie", title: "Verity" },
      perfect: true,
      reasons: [
        { kind: "because", titles: ["Gone Girl"] },
        { kind: "director", name: "David Fincher" },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(DismissSuggestionRequest.safeParse({ type: "movie", tmdbId: 0 }).success).toBe(false);
  });
});
