import { timingSafeEqual } from "node:crypto";
import { mediaUrl, nakaApiPath } from "./allowlist.ts";
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

export interface BridgeRequest {
  method: string;
  target: string;
  secret: string | undefined;
}

export interface BridgeDeps {
  secret: string;
  naka: NakaCaller;
  budget: CallBudget;
  media: MediaGate;
  mediaHosts?: readonly string[];
  now: () => number;
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
  if (request.target === "/health") return { status: 200, body: JSON.stringify({ ok: true }) };
  if (!sameSecret(request.secret, deps.secret)) return error(401, "bad secret");
  if (request.method !== "GET") return error(405, "GET only");
  if (request.target.startsWith("/media")) return handleMedia(request.target, deps);
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
    const answer = await deps.media.run(deps.now(), () => deps.naka.fetchMedia(url));
    return answer ?? error(429, "media budget spent, retry shortly");
  } catch (cause) {
    console.error("Naka media fetch failed", cause);
    return error(502, "Naka unreachable");
  }
}
