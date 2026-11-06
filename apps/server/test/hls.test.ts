import { describe, expect, it } from "vitest";
import { importHls } from "../src/hls.ts";
import { FetchError, isPrivateAddress, type TextFetcher } from "../src/safe-fetch.ts";

const Q = "token=abc&exp=1";
const BASE = "https://naka.example/api/v1/r2/movies/12445-x";

/** Mirrors the structure of a real Naka stream (one video variant, two audio groups, sibling VTT files). */
const files: Record<string, string> = {
  [`${BASE}/master.m3u8?${Q}`]: [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="fr",URI="audio_fr/playlist.m3u8?${Q}"`,
    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="en",URI="audio_en/playlist.m3u8?${Q}"`,
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"',
    `720p/playlist.m3u8?${Q}`,
  ].join("\n"),
  [`${BASE}/720p/playlist.m3u8?${Q}`]: [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:12",
    "#EXTINF:10.010000,",
    "https://media.example/movies/12445-x/720p/segment-000.ts",
    "#EXTINF:10.010000,",
    "https://media.example/movies/12445-x/720p/segment-001.ts",
    "#EXTINF:4.5,",
    "segment-002.ts",
    "#EXT-X-ENDLIST",
  ].join("\n"),
  [`${BASE}/audio_fr/playlist.m3u8?${Q}`]: "#EXTM3U\n#EXTINF:10,\nseg-0.aac\n#EXT-X-ENDLIST",
  [`${BASE}/audio_en/playlist.m3u8?${Q}`]: "#EXTM3U\n#EXTINF:10,\nseg-0.aac\n#EXT-X-ENDLIST",
  [`${BASE}/subs_fre.vtt?${Q}`]: "WEBVTT\n\n01:40.633 --> 01:45.366\nBonjour",
  [`${BASE}/subs_fre_forced.vtt?${Q}`]: "WEBVTT\n",
};

const fakeFetch: TextFetcher = async (url) => {
  const body = files[url.href];
  if (body === undefined) throw new FetchError("not found", 404);
  return body;
};

describe("importHls", () => {
  it("rewrites playlists to local names and keeps segments absolute", async () => {
    const media = await importHls(new URL(`${BASE}/master.m3u8?${Q}`), fakeFetch);

    const master = media.playlists.get("master.m3u8")!;
    expect(master).toContain('URI="p0.m3u8"');
    expect(master).toContain('URI="p1.m3u8"');
    expect(master).toMatch(/\np2\.m3u8$/);
    expect(master).not.toContain("token=");

    const video = media.playlists.get("p2.m3u8")!;
    expect(video).toContain("https://media.example/movies/12445-x/720p/segment-000.ts");
    expect(video).toContain(`${BASE}/720p/segment-002.ts`);
    expect(media.duration).toBeCloseTo(24.52);

    expect(media.playlists.get("p0.m3u8")).toContain(`${BASE}/audio_fr/seg-0.aac`);
    expect(media.audio).toEqual([
      { id: "p0.m3u8", label: "Français", language: "fr" },
      { id: "p1.m3u8", label: "English", language: "en" },
    ]);
  });

  it("discovers sibling subtitles with the same token", async () => {
    const media = await importHls(new URL(`${BASE}/master.m3u8?${Q}`), fakeFetch);
    expect(media.subtitles.map((s) => s.id)).toEqual(["subs_fre", "subs_fre_forced"]);
    expect(media.subtitles[1]?.forced).toBe(true);
    expect(media.subtitleFiles.get("subs_fre")).toContain("Bonjour");
  });

  it("accepts a bare media playlist", async () => {
    const media = await importHls(new URL(`${BASE}/720p/playlist.m3u8?${Q}`), fakeFetch);
    expect(media.playlists.get("master.m3u8")).toContain("segment-000.ts");
    expect(media.audio).toEqual([]);
  });

  it("rejects non-HLS content", async () => {
    await expect(importHls(new URL(`${BASE}/subs_fre.vtt?${Q}`), fakeFetch)).rejects.toThrow(/HLS/);
  });
});

describe("isPrivateAddress", () => {
  it("blocks local and private ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.20", "172.20.0.1", "169.254.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["104.21.3.4", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
