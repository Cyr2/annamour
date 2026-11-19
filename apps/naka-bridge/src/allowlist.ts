/*
 * The only Naka calls the bridge makes: search, a series' season, a title's
 * sources. Anything else is refused, so the bridge can never be used to act on
 * the account (profiles, history, admin…).
 */

const ALLOWED_PATHS = [/^browse\/search$/, /^browse\/\d{1,9}\/season\/\d{1,3}$/, /^streaming\/sources\/\d{1,9}$/];
const ALLOWED_PARAMS: Record<string, RegExp> = {
  q: /^.{1,80}$/su,
  type: /^(movie|tv)$/,
  season: /^\d{1,3}$/,
  episode: /^\d{1,4}$/,
};

/** Where Naka keeps its videos; only these hosts are fetched for media. */
export const DEFAULT_MEDIA_HOSTS = ["media.dooms.fit"];
const MEDIA_FILE = /\.(?:ts|aac|m4s|mp4)$/;

/**
 * Turns `/media?url=<video segment>` into the segment URL to fetch, or null
 * when it is not one of Naka's video files: the bridge only ever downloads
 * film segments, never pages or the API through this door.
 */
export function mediaUrl(target: string, hosts: readonly string[] = DEFAULT_MEDIA_HOSTS): URL | null {
  const request = new URL(target, "http://bridge");
  if (request.pathname !== "/media") return null;
  const raw = request.searchParams.get("url");
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || !MEDIA_FILE.test(url.pathname)) return null;
  return url;
}

/** The players Nakanime's episodes open in: only their pages are visited to find the video. */
export const NAKANIME_PLAYER_HOSTS = ["vidmoly.org", "vidmoly.to", "vidmoly.me", "voe.sx", "arianathankspecial.com"];

/** One of the four things the bridge reads on Nakanime, its parameters checked. */
export type NakanimeCall =
  | { kind: "search"; query: string }
  | { kind: "title"; id: number; slug: string }
  | { kind: "sources"; id: number; season: number; episode: number }
  | { kind: "resolve"; player: URL };

const SLUG = /^[a-z0-9-]{1,120}$/;
const QUERY = /^.{2,80}$/su;

function positive(value: string | null): number | null {
  return value !== null && /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

function playerUrl(raw: string | null): URL | null {
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  return url.protocol === "https:" && NAKANIME_PLAYER_HOSTS.includes(url.hostname) ? url : null;
}

/**
 * Turns `/nakanime/<kind>?…` into the call to make, or null when it is not one
 * of the allowed ones: the bridge never reads anything else on Nakanime.
 */
export function nakanimeCall(target: string): NakanimeCall | null {
  const url = new URL(target, "http://bridge");
  const params = url.searchParams;
  const id = positive(params.get("id"));
  switch (url.pathname) {
    case "/nakanime/search": {
      const query = params.get("q");
      return query && QUERY.test(query) ? { kind: "search", query } : null;
    }
    case "/nakanime/title": {
      const slug = params.get("slug");
      return id !== null && slug && SLUG.test(slug) ? { kind: "title", id, slug } : null;
    }
    case "/nakanime/sources": {
      const season = positive(params.get("season"));
      const episode = positive(params.get("episode"));
      return id !== null && season !== null && episode !== null ? { kind: "sources", id, season, episode } : null;
    }
    case "/nakanime/resolve": {
      const player = playerUrl(params.get("url"));
      return player ? { kind: "resolve", player } : null;
    }
    default:
      return null;
  }
}

/**
 * Turns the bridge's request target (`/naka/<path>?<query>`) into the Naka API
 * path to call, or null when it is not one of the allowed calls.
 */
export function nakaApiPath(target: string): string | null {
  const url = new URL(target, "http://bridge");
  const path = url.pathname.replace(/^\/naka\//, "");
  if (path === url.pathname || !ALLOWED_PATHS.some((allowed) => allowed.test(path))) return null;

  const query = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    const pattern = ALLOWED_PARAMS[name];
    if (!pattern?.test(value)) return null;
    query.set(name, value);
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
