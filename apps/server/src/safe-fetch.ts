import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches text from a user-supplied URL without letting it reach the VPS's
 * own network: HTTPS only, public addresses only, bounded size and time.
 */
export class FetchError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

export type TextFetcher = (url: URL) => Promise<string>;

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "Annamour/0.1 (+watch-together)";

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new FetchError("Only https links are supported");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FetchError("This address is not reachable");
  }
}

/** Follows redirects by hand, checking every hop's host, and returns the final successful response. */
async function safeResponse(input: URL, maxBytes: number, timeoutMs: number): Promise<Response> {
  let url = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new FetchError("Redirect without location", response.status);
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new FetchError(`Upstream answered ${response.status}`, response.status);
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new FetchError("Response too large");
    return response;
  }
  throw new FetchError("Too many redirects");
}

export const safeFetchText: TextFetcher = async (url) => {
  const body = await (await safeResponse(url, MAX_BYTES, TIMEOUT_MS)).text();
  if (body.length > MAX_BYTES) throw new FetchError("Response too large");
  return body;
};

export type BytesFetcher = (url: URL) => Promise<Uint8Array>;

/** A video segment is a few MB; a slow source gets more time than a playlist. */
const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;
const SEGMENT_TIMEOUT_MS = 60_000;

export const safeFetchBytes: BytesFetcher = async (url) => {
  const body = new Uint8Array(await (await safeResponse(url, MAX_SEGMENT_BYTES, SEGMENT_TIMEOUT_MS)).arrayBuffer());
  if (body.byteLength > MAX_SEGMENT_BYTES) throw new FetchError("Response too large");
  return body;
};
