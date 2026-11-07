import { describe, expect, it } from "vitest";
import { CatalogQuery, catalogEpisodeLabel, catalogSessionTitle, PlayCatalogRequest } from "../src/index.ts";

describe("starting a séance from the catalog", () => {
  it("takes a film without season or episode", () => {
    expect(PlayCatalogRequest.safeParse({ id: 543, type: "movie", title: "Interstellar" }).success).toBe(true);
  });

  it("asks a series for its season and episode", () => {
    expect(PlayCatalogRequest.safeParse({ id: 12, type: "tv", title: "Euphoria" }).success).toBe(false);
    expect(PlayCatalogRequest.safeParse({ id: 12, type: "tv", title: "Euphoria", season: 1 }).success).toBe(false);
    expect(PlayCatalogRequest.safeParse({ id: 12, type: "tv", title: "Euphoria", season: 1, episode: 3 }).success).toBe(
      true,
    );
  });

  it("refuses an episode on a film", () => {
    const film = { id: 543, type: "movie", title: "Interstellar", season: 1, episode: 1 };
    expect(PlayCatalogRequest.safeParse(film).success).toBe(false);
  });

  it("names the séance after the film, or the series and its episode", () => {
    expect(catalogSessionTitle({ id: 1, type: "movie", title: "Interstellar" })).toBe("Interstellar");
    expect(catalogSessionTitle({ id: 2, type: "tv", title: "Euphoria", season: 2, episode: 5 })).toBe(
      "Euphoria · S2 · É5",
    );
    expect(catalogEpisodeLabel(1, 10)).toBe("S1 · É10");
  });
});

describe("a catalog search", () => {
  it("needs at least two letters, once trimmed", () => {
    expect(CatalogQuery.safeParse(" a ").success).toBe(false);
    expect(CatalogQuery.safeParse(" du ").data).toBe("du");
  });

  it("refuses an overlong query", () => {
    expect(CatalogQuery.safeParse("x".repeat(81)).success).toBe(false);
  });
});
