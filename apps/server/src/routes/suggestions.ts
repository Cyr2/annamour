import { DismissSuggestionRequest, SUGGESTIONS_API, type SuggestionsResponse } from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, readBody, requireAccount } from "../http/context.ts";

/** « Pour vous ce soir »: what a circle could watch together, from its people's tastes. */
export function suggestionRoutes({ services }: RouteDeps) {
  const { accounts, taste } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.get(SUGGESTIONS_API.circle, signedIn, async (c) =>
    c.json({
      suggestions: await taste.forCircle(c.var.account.id, c.req.param("id")),
    } satisfies SuggestionsResponse),
  );

  routes.post(SUGGESTIONS_API.dismiss, signedIn, async (c) => {
    const request = await readBody(c, DismissSuggestionRequest, "Ce titre n'est pas lisible.");
    taste.dismiss(c.var.account.id, c.req.param("id"), request);
    return c.body(null, 204);
  });

  return routes;
}
