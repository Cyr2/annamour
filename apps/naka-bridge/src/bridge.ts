import { timingSafeEqual } from "node:crypto";
import { mediaUrl, type NakanimeCall, nakaApiPath, nakanimeCall } from "./allowlist.ts";
import type { CallBudget } from "./budget.ts";
import type { MediaGate } from "./media-gate.ts";

/** What Naka answered, passed on as is: the Annamour server validates it. */
export interface NakaAnswer {
  status: number;
  /** JSON text for the API; the file's bytes for media. */
  body: string | Uint8Array;
  contentType?: string;
}

/** Calls Naka from inside a browser page that passed Cloudflare. */
export interface NakaCaller {
  call(apiPath: string): Promise<NakaAnswer>;
  /** Downloads one video segment, as the page's own player would. */
  fetchMedia(url: URL): Promise<NakaAnswer>;
}

/**
 * Reads Nakanime from inside a browser page that passed Cloudflare. Its API
 * answers are encrypted for its own app: the page reads them as the app does.
 */
export interface NakanimeCaller {
  /** `{ data: [...] }`: the catalog's search, as the app shows it. */
  search(query: string): Promise<NakaAnswer>;
  /** The anime's page data: seasons, episodes and their versions. */
  title(id: number, slug: string): Promise<NakaAnswer>;
  /** An episode's sources: one player page per version and host. */
  sources(id: number, season: number, episode: number): Promise<NakaAnswer>;
  /** `{ url }`: the HLS playlist a player page opens. */
  resolve(player: URL): Promise<NakaAnswer>;
}

export interface BridgeRequest {
  method: string;
  target: string;
  secret: string | undefined;
}

export interface BridgeDeps {
  secret: string;
  naka: NakaCaller;
  /** Absent: the bridge reads only Naka. */
  nakanime?: NakanimeCaller;
  budget: CallBudget;
  media: MediaGate;
  mediaHosts?: readonly string[];
  now: () => number;
  /** The virtual screen the headed browser opens on is there (Xvfb); without it no call can work. */
  screenReady?: () => boolean;
}

function sameSecret(given: string | undefined, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function error(status: number, message: string): NakaAnswer {
  return { status, body: JSON.stringify({ error: message }) };
}

/** One request to the bridge: checked, counted, then forwarded to Naka. */
export async function handleBridgeRequest(request: BridgeRequest, deps: BridgeDeps): Promise<NakaAnswer> {
  // Healthy only when a call could work: a bridge without its screen stayed « healthy » while every call failed.
  if (request.target === "/health") {
    if (deps.screenReady && !deps.screenReady()) return error(503, "no virtual screen for the browser");
    return { status: 200, body: JSON.stringify({ ok: true }) };
  }
  if (!sameSecret(request.secret, deps.secret)) return error(401, "bad secret");
  if (request.method !== "GET") return error(405, "GET only");
  if (request.target.startsWith("/media")) return handleMedia(request.target, deps);
  if (request.target.startsWith("/nakanime/")) return handleNakanime(request.target, deps);
  const apiPath = nakaApiPath(request.target);
  if (apiPath === null) return error(404, "not an allowed Naka call");
  if (!deps.budget.trySpend(deps.now())) return error(429, "call budget spent, retry in a minute");
  try {
    return await deps.naka.call(apiPath);
  } catch (cause) {
    console.error("Naka call failed", cause);
    return error(502, "Naka unreachable");
  }
}

/** One film segment, for the Annamour server to make lighter qualities from. */
async function handleMedia(target: string, deps: BridgeDeps): Promise<NakaAnswer> {
  const url = mediaUrl(target, deps.mediaHosts);
  if (url === null) return error(404, "not one of Naka's video files");
  try {
    const answer = await deps.media.run(
      deps.now(),
      () => deps.naka.fetchMedia(url),
      (fetched) => fetched.body.length,
    );
    return answer ?? error(429, "media budget spent, retry shortly");
  } catch (cause) {
    console.error("Naka media fetch failed", cause);
    return error(502, "Naka unreachable");
  }
}

function callNakanime(caller: NakanimeCaller, call: NakanimeCall): Promise<NakaAnswer> {
  switch (call.kind) {
    case "search":
      return caller.search(call.query);
    case "title":
      return caller.title(call.id, call.slug);
    case "sources":
      return caller.sources(call.id, call.season, call.episode);
    case "resolve":
      return caller.resolve(call.player);
  }
}

/** One read on Nakanime, counted in the same budget as Naka's: the bridge weighs as little on both together. */
async function handleNakanime(target: string, deps: BridgeDeps): Promise<NakaAnswer> {
  const call = nakanimeCall(target);
  if (call === null || !deps.nakanime) return error(404, "not an allowed Nakanime call");
  if (!deps.budget.trySpend(deps.now())) return error(429, "call budget spent, retry in a minute");
  try {
    return await callNakanime(deps.nakanime, call);
  } catch (cause) {
    console.error("Nakanime call failed", cause);
    return error(502, "Nakanime unreachable");
  }
}
