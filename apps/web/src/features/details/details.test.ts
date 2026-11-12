import type { TitleDetails } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { factsLine, peopleLine, ratingLine, runtimeLabel, shortRating } from "./details-rules.ts";

const gone: TitleDetails = {
  tmdbId: 210577,
  genres: ["drame", "thriller", "mystère", "crime"],
  voteAverage: 7.94,
  voteCount: 19000,
  runtime: 149,
  directors: ["David Fincher"],
  cast: ["Ben Affleck", "Rosamund Pike", "Neil Patrick Harris"],
};

describe("what a title's sheet says of it", () => {
  it("gives TMDB's rating with its votes, not before a few votes", () => {
    expect(ratingLine(gone)).toBe("7,9 sur 10 · 19 000 votes");
    expect(ratingLine({ ...gone, voteCount: 3 })).toBe("");
    expect(ratingLine({ ...gone, voteAverage: undefined })).toBe("");
  });

  it("starts its one-line summary with the rating alone, when it has enough votes", () => {
    expect(shortRating(gone)).toBe("7,9");
    expect(shortRating({ ...gone, voteCount: 2 })).toBe("");
  });

  it("says its genres and length, or its seasons", () => {
    expect(factsLine(gone)).toBe("Drame, thriller · 2 h 29");
    expect(factsLine({ ...gone, runtime: undefined, seasons: 3 })).toBe("Drame, thriller · 3 saisons");
    expect(factsLine({ ...gone, genres: [], runtime: undefined })).toBe("");
    expect(runtimeLabel(45)).toBe("45 min");
    expect(runtimeLabel(120)).toBe("2 h");
    expect(runtimeLabel(125)).toBe("2 h 05");
  });

  it("names who made it and who plays in it", () => {
    expect(peopleLine(gone)).toBe("De David Fincher · Avec Ben Affleck, Rosamund Pike et Neil Patrick Harris");
    expect(peopleLine({ ...gone, directors: [] })).toBe("Avec Ben Affleck, Rosamund Pike et Neil Patrick Harris");
    expect(peopleLine({ ...gone, directors: [], cast: [] })).toBe("");
  });
});
