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
