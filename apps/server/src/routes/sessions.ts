import { API, type SessionList } from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, requireAccount } from "../http/context.ts";

export function sessionRoutes({ services }: RouteDeps) {
  const { accounts, history } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.get(API.sessions, signedIn, (c) => c.json({ sessions: history.list(c.var.account.id) } satisfies SessionList));

  routes.delete(API.sessionForEveryone, signedIn, (c) => {
    history.deleteForEveryone(c.req.param("code").toUpperCase(), c.var.account.id);
    return c.body(null, 204);
  });

  routes.delete(API.session, signedIn, (c) => {
    history.leave(c.req.param("code").toUpperCase(), c.var.account.id);
    return c.body(null, 204);
  });

  return routes;
}
