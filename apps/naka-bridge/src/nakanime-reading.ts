/*
 * Nakanime's API answers are encrypted for its own app. The bridge never
 * breaks that: its page lets the app decrypt them, notes every JSON text the
 * app reads, and these functions pick the one asked for.
 */

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The catalog's search answer: `{ data: [...], meta, facets }` (its suggestions have no facets). */
export function pickSearch(texts: readonly string[]): string | null {
  return (
    texts.find((text) => {
      const value = parsed(text);
      return isRecord(value) && Array.isArray(value.data) && isRecord(value.meta) && "facets" in value;
    }) ?? null
  );
}

function isSource(value: unknown): boolean {
  return isRecord(value) && typeof value.url === "string" && typeof value.host === "string" && "language" in value;
}

/** An episode's sources: an array of `{ id, url, host, language, episodeId }`. */
export function pickSources(texts: readonly string[]): string | null {
  return (
    texts.find((text) => {
      const value = parsed(text);
      return Array.isArray(value) && value.length > 0 && value.every(isSource);
    }) ?? null
  );
}

/** The HLS playlist a player asked for first: its master (or its only) playlist. */
export function isPlaylistRequest(url: string): boolean {
  return URL.canParse(url) && new URL(url).pathname.endsWith(".m3u8");
}
