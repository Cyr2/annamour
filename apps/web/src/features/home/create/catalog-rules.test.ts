import type { CatalogTitle } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { episodeLanguage, filmRequest, pickedTitle, sourceLabel, titleKey } from "./catalog-rules.ts";

const dune: CatalogTitle = { id: 16, type: "movie", title: "Dune", tmdbId: 438631 };
const onePiece: CatalogTitle = {
  id: 16,
  type: "tv",
  title: "One Piece",
  source: "nakanime",
  slug: "one-piece",
  languages: ["VF", "VOSTFR"],
};

describe("titles from Naka and Nakanime side by side", () => {
  it("say where they come from, Naka for titles kept from before", () => {
    expect(sourceLabel(dune)).toBe("Naka");
    expect(sourceLabel(onePiece)).toBe("Nakanime");
  });

  it("never mix up two titles with the same number", () => {
    expect(titleKey(dune)).not.toBe(titleKey({ ...onePiece, type: "movie" }));
  });

  it("take their page name along for an anime, nothing more for Naka's", () => {
    expect(pickedTitle(dune)).toEqual({ id: 16, title: "Dune", tmdbId: 438631 });
    expect(pickedTitle(onePiece)).toEqual({ id: 16, title: "One Piece", source: "nakanime", slug: "one-piece" });
  });

  it("play an anime film in VF when it has it, else in VOSTFR", () => {
    const film = { ...onePiece, type: "movie" as const };
    expect(filmRequest(film).language).toBe("VF");
    expect(filmRequest({ ...film, languages: ["VOSTFR"] }).language).toBe("VOSTFR");
    expect(filmRequest(dune)).toEqual({ id: 16, title: "Dune", tmdbId: 438631, type: "movie" });
  });
});

describe("an anime episode's version", () => {
  it("is the one chosen when the episode has it, else the one it has", () => {
    expect(episodeLanguage({ number: 1, languages: ["VF", "VOSTFR"] }, "VOSTFR")).toBe("VOSTFR");
    expect(episodeLanguage({ number: 2, languages: ["VOSTFR"] }, "VF")).toBe("VOSTFR");
    expect(episodeLanguage({ number: 3 }, "VF")).toBe("VF");
  });
});
