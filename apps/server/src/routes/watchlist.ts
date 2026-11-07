import {
  AddToWatchlistRequest,
  type AddToWatchlistResponse,
  WATCHLIST_API,
  type WatchlistResponse,
  WatchlistWantRequest,
  WatchlistWatchedRequest,
} from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, readBody, requireAccount } from "../http/context.ts";

/** « À regarder ensemble »: the signed-in person's shared watchlist. */
export function watchlistRoutes({ services }: RouteDeps) {
  const { accounts, watchlist } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.get(WATCHLIST_API.list, signedIn, (c) =>
    c.json({ items: watchlist.list(c.var.account.id) } satisfies WatchlistResponse),
  );

  routes.post(WATCHLIST_API.list, signedIn, async (c) => {
    const request = await readBody(c, AddToWatchlistRequest, "Choisis un titre et avec qui le partager.");
    return c.json({ id: watchlist.add(c.var.account.id, request) } satisfies AddToWatchlistResponse, 201);
  });

  routes.patch(WATCHLIST_API.want, signedIn, async (c) => {
    const { want } = await readBody(c, WatchlistWantRequest, "Réponse illisible.");
    watchlist.setWant(c.var.account.id, c.req.param("id"), want);
    return c.body(null, 204);
  });

  routes.patch(WATCHLIST_API.watched, signedIn, async (c) => {
    const { watched } = await readBody(c, WatchlistWatchedRequest, "Réponse illisible.");
    watchlist.setWatched(c.var.account.id, c.req.param("id"), watched);
    return c.body(null, 204);
  });

  routes.delete(WATCHLIST_API.item, signedIn, (c) => {
    watchlist.remove(c.var.account.id, c.req.param("id"));
    return c.body(null, 204);
  });

  return routes;
}
