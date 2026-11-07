import { timingSafeEqual } from "node:crypto";
import { nakaApiPath } from "./allowlist.ts";
import type { CallBudget } from "./budget.ts";

/** What Naka answered, passed on as is: the Annamour server validates it. */
export interface NakaAnswer {
  status: number;
  body: string;
}

/** Calls Naka's API from inside a browser page that passed Cloudflare. */
export interface NakaCaller {
  call(apiPath: string): Promise<NakaAnswer>;
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
