import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeArguments } from "../src/media/ffmpeg.ts";
import { RUNGS } from "../src/media/ladder.ts";
import { segmentSource } from "../src/media/segment-source.ts";
import { FetchError, safeFetchBytes } from "../src/safe-fetch.ts";

const SEGMENT = new URL("https://media.example/movies/1/720p/segment-000.ts");
const BRIDGE = { url: "http://naka-bridge:3000", secret: "s3cret" };

afterEach(() => vi.unstubAllGlobals());

describe("getting a source segment", () => {
  it("comes straight from the source when it lets servers in", async () => {
    const source = segmentSource(async () => new Uint8Array([7]), BRIDGE);
    expect(await source(SEGMENT)).toEqual(new Uint8Array([7]));
  });

  it("goes through naka-bridge when the source only lets browsers in", async () => {
    const bridgeFetch = vi.fn(async () => new Response(new Uint8Array([1, 2])));
    vi.stubGlobal("fetch", bridgeFetch);
    const refused = async (): Promise<Uint8Array> => {
      throw new FetchError("denied", 403);
    };
    expect(await segmentSource(refused, BRIDGE)(SEGMENT)).toEqual(new Uint8Array([1, 2]));
    const [target, init] = bridgeFetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.href).toBe(`http://naka-bridge:3000/media?url=${encodeURIComponent(SEGMENT.href)}`);
    expect(init.headers).toEqual({ "x-bridge-secret": "s3cret" });
  });

  it("passes the bridge's refusal on, so the segment is tried again later", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 429 }));
    const refused = async (): Promise<Uint8Array> => {
      throw new FetchError("denied", 403);
    };
    await expect(segmentSource(refused, BRIDGE)(SEGMENT)).rejects.toMatchObject({ status: 429 });
  });

  it("does not hide other failures behind the bridge, nor use a bridge that is not there", async () => {
    const missing = async (): Promise<Uint8Array> => {
      throw new FetchError("gone", 404);
    };
    const denied = async (): Promise<Uint8Array> => {
      throw new FetchError("denied", 403);
    };
    await expect(segmentSource(missing, BRIDGE)(SEGMENT)).rejects.toMatchObject({ status: 404 });
    await expect(segmentSource(denied, undefined)(SEGMENT)).rejects.toMatchObject({ status: 403 });
  });

  it("fetches bytes safely, as playlists are", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([9, 9])));
    expect(await safeFetchBytes(new URL("https://93.184.216.34/s.ts"))).toEqual(new Uint8Array([9, 9]));
    await expect(safeFetchBytes(new URL("https://127.0.0.1/s.ts"))).rejects.toBeInstanceOf(FetchError);
  });
});

describe("the ffmpeg command for one segment", () => {
  const args = encodeArguments(
    "in.ts",
    RUNGS.map((rung) => ({ rung, path: `${rung.name}.ts` })),
  );

  it("decodes once and makes every rung, keeping the source's timestamps", () => {
    expect(args).toContain("-copyts");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[0:v]split=4[v0in][v1in][v2in][v3in];[v0in]scale=-2:480[v0];[v1in]scale=-2:540[v1];[v2in]scale=-2:360[v2];[v3in]scale=-2:234[v3]",
    );
    expect(args.filter((arg) => arg === "mpegts")).toHaveLength(4);
    expect(args.at(-1)).toBe("q234.ts");
    expect(args.filter((arg) => arg === "3.1")).toHaveLength(1);
  });

  it("caps each rung's bitrate and puts a key frame at the start of every segment", () => {
    expect(args).toContain("1000k");
    expect(args).toContain("550k");
    expect(args).toContain("expr:if(isnan(prev_forced_t),1,gte(t,prev_forced_t+2))");
  });
});
