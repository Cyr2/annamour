import { describe, expect, it } from "vitest";
import {
  RUNGS,
  rungNamed,
  rungPlaylist,
  rungsFor,
  segmentAt,
  segmentSources,
  sourceVariant,
  withLowQualities,
} from "../src/media/ladder.ts";

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",DEFAULT=YES,LANGUAGE="fr",URI="p0.m3u8"

#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
p1.m3u8`;

const SOURCE = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.01,
https://cdn.test/720p/segment-000.ts
#EXTINF:10.01,
https://cdn.test/720p/segment-001.ts
#EXTINF:6.5,
https://cdn.test/720p/segment-002.ts
#EXT-X-ENDLIST`;

const source = () => {
  const variant = sourceVariant(MASTER);
  if (!variant) throw new Error("no variant");
  return variant;
};

describe("a source with a single quality", () => {
  it("is read from its master: playlist, size and stream line", () => {
    expect(source()).toMatchObject({ uri: "p1.m3u8", width: 1280, height: 720 });
  });

  it("gets every lighter rung, from MPEG-TS segments", () => {
    expect(rungsFor(source(), SOURCE)).toEqual([...RUNGS]);
  });

  it("gets no rung when it is already small, or made of fMP4 segments", () => {
    const small = { ...source(), height: 360 };
    expect(rungsFor(small, SOURCE).map((rung) => rung.name)).toEqual([]);
    expect(rungsFor(source(), `#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\nhttps://cdn.test/a.m4s`)).toEqual([]);
    expect(rungsFor(source(), "#EXTM3U")).toEqual([]);
  });

  it("is not recognised without a declared resolution", () => {
    expect(sourceVariant("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8")).toBeUndefined();
    expect(sourceVariant("#EXTM3U\n#EXTINF:10,\ns.ts")).toBeUndefined();
  });
});

describe("the master with lighter qualities", () => {
  const master = withLowQualities(MASTER, source(), RUNGS);

  it("lists the lighter rungs first, the one a phone on 4G should start with on top", () => {
    const variants = master.split("\n").filter((line) => !line.startsWith("#") && line.trim());
    expect(variants).toEqual(["q480.m3u8", "q360.m3u8", "p1.m3u8"]);
  });

  it("declares what Apple requires for each rung, with the source's audio", () => {
    expect(master).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=1160000,AVERAGE-BANDWIDTH=960000,RESOLUTION=854x480,CODECS="avc1.64001e,mp4a.40.2",AUDIO="audio"',
    );
    expect(master).toContain("RESOLUTION=640x360");
  });

  it("stays as it was when there is nothing to add", () => {
    expect(withLowQualities(MASTER, source(), [])).toBe(MASTER);
  });

  it("copies the frame rate, and has no audio codec when the source declares none", () => {
    const info = '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080,CODECS="avc1.640028",FRAME-RATE=23.976';
    const bare = sourceVariant(`#EXTM3U\n${info}\nv.m3u8`);
    if (!bare) throw new Error("no variant");
    const out = withLowQualities(`#EXTM3U\n${info}\nv.m3u8`, bare, RUNGS);
    expect(out).toContain('RESOLUTION=854x480,CODECS="avc1.64001e",FRAME-RATE=23.976');
  });
});

describe("a rung's playlist", () => {
  it("keeps the source's durations and points each segment to our encode of it", () => {
    const playlist = rungPlaylist(SOURCE, RUNGS[0] ?? RUNGS[1] ?? ({} as never));
    expect(playlist).toContain("#EXTINF:6.5,\nq480/00002.ts");
    expect(playlist).toContain("#EXT-X-ENDLIST");
    expect(playlist).not.toContain("cdn.test");
  });

  it("lists the source segments to encode from", () => {
    expect(segmentSources(SOURCE)).toHaveLength(3);
  });

  it("finds a rung by its name", () => {
    expect(rungNamed("q360")?.height).toBe(360);
    expect(rungNamed("p0")).toBeUndefined();
  });
});

describe("where the séance is", () => {
  it("finds the segment playing at a position", () => {
    expect(segmentAt(SOURCE, 0)).toBe(0);
    expect(segmentAt(SOURCE, 10.5)).toBe(1);
    expect(segmentAt(SOURCE, 25)).toBe(2);
    expect(segmentAt(SOURCE, 9999)).toBe(2);
  });
});
