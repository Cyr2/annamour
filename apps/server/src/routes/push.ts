import {
  PlanSeanceRequest,
  PUSH_API,
  type PushKeyResponse,
  PushSubscriptionRequest,
  PushUnsubscribeRequest,
} from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, readBody, requireAccount } from "../http/context.ts";

/** Notifications: this device's subscription, and the evening planned on a séance. */
export function pushRoutes({ services }: RouteDeps) {
  const { accounts, push, plans } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);
  const codeOf = (param: string) => param.toUpperCase();

  routes.get(PUSH_API.key, (c) => {
    const { publicKey } = push;
    return c.json((publicKey === undefined ? {} : { publicKey }) satisfies PushKeyResponse);
  });

  routes.post(PUSH_API.subscription, signedIn, async (c) => {
    const subscription = await readBody(
      c,
      PushSubscriptionRequest,
      "Abonnement illisible : réactive les notifications.",
    );
    push.subscribe(c.var.account.id, subscription);
    return c.body(null, 204);
  });

  routes.delete(PUSH_API.subscription, signedIn, async (c) => {
    const { endpoint } = await readBody(c, PushUnsubscribeRequest, "Abonnement illisible.");
    push.unsubscribe(c.var.account.id, endpoint);
    return c.body(null, 204);
  });

  routes.put(PUSH_API.plan, signedIn, async (c) => {
    const { at } = await readBody(c, PlanSeanceRequest, "Choisis un jour et une heure.");
    plans.plan(codeOf(c.req.param("code")), c.var.account.id, at);
    return c.body(null, 204);
  });

  routes.delete(PUSH_API.plan, signedIn, (c) => {
    plans.cancel(codeOf(c.req.param("code")), c.var.account.id);
    return c.body(null, 204);
  });

  return routes;
}
