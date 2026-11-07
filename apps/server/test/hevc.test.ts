import { describe, expect, it } from "vitest";
import {
  firstDecodeTime,
  fmp4Playlist,
  HEVC_RUNGS,
  hevcAudio,
  hevcCodecs,
  hevcRungNamed,
  isAppleHlsClient,
  Mp4Error,
  splitMp4,
  withHevc,
} from "../src/media/hevc.ts";
import { hevcArguments } from "../src/media/hevc-ffmpeg.ts";
import { box, fragment, hevcInit, hevcMp4 } from "./mp4-fixtures.ts";

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const AVPLAYER = "AppleCoreMedia/1.0.0.22A3354 (iPad; U; CPU OS 18_0 like Mac OS X; fr_fr)";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const ANDROID_TV =
  "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";

describe("who gets the HEVC rungs", () => {
  it("is Safari's own player, on an iPad, iPhone or Mac", () => {
    for (const ua of [IPAD_SAFARI, IPHONE_SAFARI, AVPLAYER]) expect(isAppleHlsClient(ua), ua).toBe(true);
  });

  it("is never a browser that plays through hls.js, nor the Android TV app", () => {
    for (const ua of [CHROME_IOS, CHROME_MAC, ANDROID_TV, undefined, ""]) expect(isAppleHlsClient(ua)).toBe(false);
  });
});

describe("a fragmented MP4 from one encode", () => {
  it("splits into its init (up to moov) and its media segment (the fragments)", () => {
    const init = hevcInit();
    const { init: head, segment } = splitMp4(hevcMp4(900_000));
    expect([...head]).toEqual([...init]);
    expect(firstDecodeTime(segment)).toBe(900_000);
  });

  it("is refused when it is not fragmented", () => {
    expect(() => splitMp4(box("ftyp"))).toThrow(Mp4Error);
    expect(() => splitMp4(new Uint8Array([...fragment(0), ...hevcInit()]))).toThrow(Mp4Error);
  });

  it("tells its first decode time, 32 or 64 bits", () => {
    expect(firstDecodeTime(fragment(123_456))).toBe(123_456);
    expect(firstDecodeTime(fragment(2 ** 33 + 5, 1))).toBe(2 ** 33 + 5);
    expect(firstDecodeTime(box("mdat"))).toBeUndefined();
  });

  it("copes with a 64-bit box size and a box running to the end", () => {
    const large = new Uint8Array(16 + 4);
    const view = new DataView(large.buffer);
    view.setUint32(0, 1);
    large.set(new TextEncoder().encode("mdat"), 4);
    view.setBigUint64(8, BigInt(large.length));
    const toEnd = box("mdat", new Uint8Array(3));
    new DataView(toEnd.buffer).setUint32(0, 0);
    const mp4 = new Uint8Array([...hevcInit(), ...fragment(10), ...large, ...toEnd]);
    expect(splitMp4(mp4).segment.length).toBe(fragment(10).length + large.length + toEnd.length);
  });
});

describe("the CODECS string Safari checks", () => {
  it("is read from the init's hvcC, as RFC 6381 writes it", () => {
    expect(hevcCodecs(hevcInit(90))).toBe("hvc1.1.6.L90.B0");
    expect(hevcCodecs(hevcInit(93, true))).toBe("hvc1.1.6.H93.B0");
  });

  it("is refused without an hvc1 sample entry", () => {
    expect(() => hevcCodecs(box("moov"))).toThrow(Mp4Error);
  });
});

describe("the HEVC playlists and master", () => {
  const source =
    "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.01,\nhttps://cdn.test/a.ts\n#EXTINF:10.01,\nhttps://cdn.test/b.ts\n#EXT-X-ENDLIST";

  it("follow the source's durations, with their init and fMP4 segments", () => {
    const playlist = fmp4Playlist(source, "h360");
    expect(playlist).toContain("#EXT-X-VERSION:7");
    expect(playlist).toContain('#EXT-X-MAP:URI="h360/init.mp4"\n#EXTINF:10.01,\nh360/00000.m4s');
    expect(playlist).toContain("h360/00001.m4s");
    expect(playlist).not.toContain("cdn.test");
  });

  it("twin the lighter audio into an fMP4 group, same names and languages", () => {
    const twin = hevcAudio({
      group: "audio-lo",
      renditions: [
        {
          name: "lo-a0",
          sourceUri: "p0.m3u8",
          line: '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-lo",NAME="Français",LANGUAGE="fr",URI="lo-a0.m3u8"',
          isDefault: true,
        },
      ],
    });
    expect(twin).toEqual({
      group: "audio-hevc",
      renditions: [
        {
          name: "h-a0",
          sourceUri: "p0.m3u8",
          line: '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-hevc",NAME="Français",LANGUAGE="fr",URI="h-a0.m3u8"',
          isDefault: true,
          sourceOf: "lo-a0",
        },
      ],
    });
  });

  it("list each HEVC rung with what Safari requires, before the source's variant", () => {
    const info = '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"';
    const master = `#EXTM3U\n${info}\np2.m3u8`;
    const h360 = hevcRungNamed("h360");
    if (!h360) throw new Error("h360");
    const out = withHevc(master, info, {
      rungs: [{ rung: h360, codecs: "hvc1.1.6.L90.B0", width: 640, frameRate: 23.976 }],
      audioGroup: "audio-hevc",
      audioLines: ['#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-hevc",NAME="Français",URI="h-a0.m3u8"'],
    });
    expect(out).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=450000,AVERAGE-BANDWIDTH=374000,RESOLUTION=640x360,CODECS="hvc1.1.6.L90.B0,mp4a.40.2",FRAME-RATE=23.976,VIDEO-RANGE=SDR,AUDIO="audio-hevc"\nh360.m3u8',
    );
    expect(out.indexOf("h-a0.m3u8")).toBeLessThan(out.indexOf("h360.m3u8"));
    expect(out.indexOf("h360.m3u8")).toBeLessThan(out.indexOf("p2.m3u8"));
  });
});

describe("the x265 command for one segment", () => {
  const args = hevcArguments(
    "in.ts",
    HEVC_RUNGS.map((rung) => ({ rung, path: `${rung.name}.mp4` })),
  );

  it("makes hvc1 fragmented MP4 on the source's clock, with closed GOPs and no in-band headers", () => {
    expect(args).toContain("-copyts");
    expect(args.filter((arg) => arg === "hvc1")).toHaveLength(HEVC_RUNGS.length);
    expect(args).toContain("+frag_keyframe+empty_moov+default_base_moof+frag_discont+skip_sidx+skip_trailer");
    expect(args.join(" ")).toContain("open-gop=0");
    expect(args.join(" ")).toContain("repeat-headers=0:info=0");
    expect(args.at(-1)).toBe("h234.mp4");
  });
});
