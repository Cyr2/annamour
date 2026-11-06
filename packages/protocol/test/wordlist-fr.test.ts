import { describe, expect, it } from "vitest";
import { KeyWord, WORDLIST_FR } from "../src/index.ts";

describe("French key word list", () => {
  it("holds exactly 2048 distinct words, so 4 words give 44 bits", () => {
    expect(WORDLIST_FR).toHaveLength(2048);
    expect(new Set(WORDLIST_FR).size).toBe(2048);
  });

  it("only has short lowercase words without accents, easy to type anywhere", () => {
    const awkward = WORDLIST_FR.filter((word) => !/^[a-z]{3,8}$/.test(word));
    expect(awkward).toEqual([]);
  });

  it("only has words a key can be typed back with", () => {
    expect(WORDLIST_FR.every((word) => KeyWord.safeParse(word).success)).toBe(true);
  });
});
