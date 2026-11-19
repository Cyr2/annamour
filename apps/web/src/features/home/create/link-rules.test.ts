import { describe, expect, it } from "vitest";
import { linkProblem } from "./link-rules.ts";

describe("a pasted link", () => {
  it("must be a YouTube video for « YouTube »", () => {
    expect(linkProblem("youtube", " https://youtu.be/dQw4w9WgXcQ ")).toBeNull();
    expect(linkProblem("youtube", "https://cdn.example/master.m3u8")).toBe("Colle un lien de vidéo YouTube.");
  });

  it("is left to the server for a playlist, which also takes a YouTube link", () => {
    expect(linkProblem("m3u8", "https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(linkProblem("m3u8", "https://cdn.example/master.m3u8")).toBeNull();
  });
});
