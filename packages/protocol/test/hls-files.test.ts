import { describe, expect, it } from "vitest";
import { estimateBytes, mediaFiles, readMaster } from "../src/hls-files.ts";

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",DEFAULT=YES,LANGUAGE="fr",URI="p0.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="p1.m3u8"

#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
p2.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
p3.m3u8`;

describe("reading a film's master playlist", () => {
  it("keeps the first video variant and every audio rendition", () => {
    expect(readMaster(MASTER)).toEqual({ video: "p2.m3u8", audio: ["p0.m3u8", "p1.m3u8"], bandwidth: 3_000_000 });
  });

  it("finds nothing to download in a media playlist given as a master", () => {
    expect(readMaster("#EXTM3U\n#EXTINF:10,\nseg.ts")).toEqual({ video: undefined, audio: [], bandwidth: undefined });
  });

  it("copes with a variant that declares no bitrate", () => {
    expect(readMaster("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1x1\nv.m3u8").bandwidth).toBeUndefined();
  });
});

describe("listing a media playlist's files", () => {
  it("lists every segment and its init section, in order", () => {
    const text = `#EXTM3U
#EXT-X-MAP:URI="https://cdn.test/init.mp4"
#EXTINF:10.0,
https://cdn.test/segment-000.m4s
#EXTINF:10.0,
https://cdn.test/segment-001.m4s
#EXT-X-ENDLIST`;
    expect(mediaFiles(text)).toEqual([
      "https://cdn.test/init.mp4",
      "https://cdn.test/segment-000.m4s",
      "https://cdn.test/segment-001.m4s",
    ]);
  });
});

describe("estimating a film's size", () => {
  it("multiplies the bitrate by the duration", () => {
    // 2 h 49 at 3 Mb/s: about 3.8 GB.
    expect(estimateBytes(3_000_000, 10_144)).toBe(3_804_000_000);
  });
});
