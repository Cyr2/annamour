import { RATINGS_API, RatedTitleParams, RateRequest, type RatingsResponse } from "@annamour/protocol";
import { Hono } from "hono";
import { z } from "zod/mini";
import { NotFoundError } from "../errors.ts";
import { type AppEnv, type RouteDeps, readBody, requireAccount } from "../http/context.ts";

/** « Ton avis » on films and series. */
export function ratingRoutes({ services }: RouteDeps) {
  const { accounts, ratings } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.get(RATINGS_API.list, signedIn, (c) =>
    c.json({ ratings: ratings.list(c.var.account.id) } satisfies RatingsResponse),
  );

  routes.put(RATINGS_API.list, signedIn, async (c) => {
    const { title, rating } = await readBody(c, RateRequest, "Choisis ton avis sur ce titre.");
    ratings.rate(c.var.account.id, title, rating);
    return c.body(null, 204);
  });

  routes.delete(RATINGS_API.item, signedIn, (c) => {
    const params = z.safeParse(RatedTitleParams, c.req.param());
    if (!params.success) throw new NotFoundError("Ce titre n'existe pas.");
    ratings.unrate(c.var.account.id, params.data.type, params.data.id);
    return c.body(null, 204);
  });

  return routes;
}
