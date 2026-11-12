import { SUGGESTIONS_API, type SuggestionsResponse } from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, requireAccount } from "../http/context.ts";

/** « Pour vous ce soir »: what a circle could watch together, from its people's tastes. */
export function suggestionRoutes({ services }: RouteDeps) {
  const { accounts, taste } = services;
  const routes = new Hono<AppEnv>();

  routes.get(SUGGESTIONS_API.circle, requireAccount(accounts), async (c) =>
    c.json({
      suggestions: await taste.forCircle(c.var.account.id, c.req.param("id")),
    } satisfies SuggestionsResponse),
  );

  return routes;
}
