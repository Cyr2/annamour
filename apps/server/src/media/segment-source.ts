import { type BytesFetcher, FetchError } from "../safe-fetch.ts";

/** Downloads one segment of a film's source, to make its lighter rungs from. */
export type SegmentSource = (url: URL) => Promise<Uint8Array>;

export interface BridgeAccess {
  url: string;
  secret: string;
}

const BRIDGE_TIMEOUT_MS = 90_000;

/**
 * Straight from the source when it lets servers in; through naka-bridge when
 * its CDN only lets browsers through (Naka's video host answers 403 to us).
 */
export function segmentSource(direct: BytesFetcher, bridge: BridgeAccess | undefined): SegmentSource {
  return async (url) => {
    try {
      return await direct(url);
    } catch (error) {
      const refused = error instanceof FetchError && (error.status === 401 || error.status === 403);
      if (!refused || !bridge) throw error;
      return viaBridge(url, bridge);
    }
  };
}

async function viaBridge(url: URL, bridge: BridgeAccess): Promise<Uint8Array> {
  const target = new URL(`/media?url=${encodeURIComponent(url.href)}`, bridge.url);
  const response = await fetch(target, {
    headers: { "x-bridge-secret": bridge.secret },
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new FetchError(`naka-bridge answered ${response.status}`, response.status);
  return new Uint8Array(await response.arrayBuffer());
}
