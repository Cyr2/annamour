import { describe, expect, it } from "vitest";
import {
  CatalogQuery,
  CatalogSeasonQuery,
  CatalogTitle,
  catalogEpisodeLabel,
  catalogLabel,
  EpisodeInfo,
  nextCatalogEpisode,
  PlayCatalogRequest,
  preferredLanguage,
} from "../src/index.ts";

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

  it("names a series episode by its season and number, a film by its title", () => {
    expect(catalogLabel({ id: 2, type: "tv", title: "Euphoria", season: 2, episode: 5 })).toBe("S2 · É5");
    expect(catalogLabel({ id: 1, type: "movie", title: "Interstellar" })).toBe("Interstellar");
    expect(catalogEpisodeLabel(1, 10)).toBe("S1 · É10");
  });

  it("shortens a long film title to fit an episode label", () => {
    const label = catalogLabel({ id: 1, type: "movie", title: "x".repeat(60) });
    expect(label).toHaveLength(40);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("what follows in a series", () => {
  const euphoria = { id: 1000, type: "tv" as const, title: "Euphoria", season: 1, episode: 7 };

  it("is the next episode of the season when the season has it", () => {
    expect(nextCatalogEpisode(euphoria, [1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ ...euphoria, episode: 8 });
  });

  it("is the first episode of the next season after the last one", () => {
    expect(nextCatalogEpisode({ ...euphoria, episode: 8 }, [1, 2, 3, 4, 5, 6, 7, 8])).toEqual({
      ...euphoria,
      season: 2,
      episode: 1,
    });
  });

  it("is nothing after a film", () => {
    expect(nextCatalogEpisode({ id: 1, type: "movie", title: "Interstellar" }, [])).toBeNull();
  });

  it("travels with the episode it was made from", () => {
    expect(EpisodeInfo.safeParse({ label: "S1 · É1", catalog: euphoria }).success).toBe(true);
    expect(EpisodeInfo.safeParse({ catalog: { id: 1, type: "tv", title: "X" } }).success).toBe(false);
  });
});

describe("an anime from Nakanime", () => {
  const frieren = {
    id: 17,
    type: "tv" as const,
    title: "Frieren",
    source: "nakanime" as const,
    slug: "frieren",
    season: 1,
    episode: 28,
  };

  it("plays in VF when the episode has it, else in VOSTFR", () => {
    expect(preferredLanguage(["VF", "VOSTFR"])).toBe("VF");
    expect(preferredLanguage(["VOSTFR"])).toBe("VOSTFR");
    expect(preferredLanguage([])).toBe("VF");
    expect(preferredLanguage(undefined)).toBe("VF");
  });

  it("needs its slug to find its page", () => {
    const { slug: _slug, ...withoutSlug } = frieren;
    expect(PlayCatalogRequest.safeParse(frieren).success).toBe(true);
    expect(PlayCatalogRequest.safeParse(withoutSlug).success).toBe(false);
    expect(PlayCatalogRequest.safeParse({ ...frieren, slug: "../admin" }).success).toBe(false);
    expect(CatalogSeasonQuery.safeParse({ source: "nakanime", slug: "frieren" }).success).toBe(true);
  });

  it("says its version in the episode's name", () => {
    expect(catalogLabel({ ...frieren, language: "VOSTFR" })).toBe("S1 · É28 · VOSTFR");
  });

  it("goes on with the next number in the next season: Nakanime counts episodes across seasons", () => {
    expect(nextCatalogEpisode(frieren, [27, 28])).toEqual({ ...frieren, season: 2, episode: 29 });
    expect(nextCatalogEpisode({ ...frieren, episode: 27 }, [27, 28])).toEqual(frieren);
  });

  it("keeps where a title comes from, Naka when it does not say (titles kept before)", () => {
    const anime = { id: 17, type: "tv", title: "Frieren", source: "nakanime", languages: ["VF", "VOSTFR"] };
    expect(CatalogTitle.safeParse(anime).success).toBe(true);
    expect(CatalogTitle.safeParse({ ...anime, languages: ["VO"] }).success).toBe(false);
    expect(CatalogTitle.parse({ id: 1, type: "movie", title: "Dune" }).source).toBeUndefined();
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
