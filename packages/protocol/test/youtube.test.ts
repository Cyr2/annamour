import { describe, expect, it } from "vitest";
import { ClientMessage, Media, youTubeVideoId } from "../src/index.ts";

describe("a YouTube link", () => {
  it("gives its video id, whatever its form", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ])
      expect(youTubeVideoId(link), link).toBe("dQw4w9WgXcQ");
  });

  it("is not any other link, nor a YouTube page that is not a video", () => {
    for (const link of [
      "https://cdn.example/master.m3u8",
      "https://www.youtube.com/@channel",
      "https://www.youtube.com/watch?v=short",
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "pas un lien",
    ])
      expect(youTubeVideoId(link), link).toBeNull();
  });

  it("travels in a séance's media, and the player says its length and whether it is live", () => {
    const media = { title: "Live", src: "", audio: [], subtitles: [], youtube: { videoId: "dQw4w9WgXcQ", live: true } };
    expect(Media.safeParse(media).success).toBe(true);
    expect(ClientMessage.safeParse({ type: "youtubeInfo", episode: 0, duration: 0, live: true }).success).toBe(true);
    expect(ClientMessage.safeParse({ type: "youtubeInfo", episode: 0, duration: -1, live: false }).success).toBe(false);
  });
});
