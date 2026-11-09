import {
  CIRCLES_API,
  type CircleInvite,
  type CircleInvitePreview,
  type CircleList,
  CircleOrderRequest,
  CreateCircleRequest,
  type CreateCircleResponse,
  JoinCircleRequest,
  MergeCirclesRequest,
  RenameCircleRequest,
} from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, readBody, requireAccount } from "../http/context.ts";

/** The signed-in person's circles: see, create, name, leave, invite into, join, reunite. */
export function circleRoutes({ services }: RouteDeps) {
  const { accounts, circles } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.get(CIRCLES_API.list, signedIn, (c) =>
    c.json({ circles: circles.list(c.var.account.id) } satisfies CircleList),
  );

  routes.post(CIRCLES_API.list, signedIn, async (c) => {
    const { name } = await readBody(c, CreateCircleRequest, "Donne un nom au cercle.");
    return c.json({ id: circles.create(c.var.account.id, name) } satisfies CreateCircleResponse, 201);
  });

  // Registered before the ":id" routes, so « join » is never read as a circle id.
  routes.post(CIRCLES_API.join, signedIn, async (c) => {
    const { token } = await readBody(c, JoinCircleRequest, "Ce lien d'invitation est illisible.");
    return c.json({ id: circles.join(c.var.account.id, token) } satisfies CreateCircleResponse);
  });

  routes.put(CIRCLES_API.order, signedIn, async (c) => {
    const { ids } = await readBody(c, CircleOrderRequest, "Cet ordre de cercles est illisible.");
    circles.reorder(c.var.account.id, ids);
    return c.body(null, 204);
  });

  routes.get(CIRCLES_API.preview, signedIn, (c) =>
    c.json(circles.preview(c.req.param("token")) satisfies CircleInvitePreview),
  );

  routes.patch(CIRCLES_API.item, signedIn, async (c) => {
    const { name } = await readBody(c, RenameCircleRequest, "Donne un nom au cercle.");
    circles.rename(c.var.account.id, c.req.param("id"), name);
    return c.body(null, 204);
  });

  routes.delete(CIRCLES_API.item, signedIn, (c) => {
    circles.leave(c.var.account.id, c.req.param("id"));
    return c.body(null, 204);
  });

  routes.post(CIRCLES_API.invite, signedIn, (c) =>
    c.json(circles.invite(c.var.account.id, c.req.param("id")) satisfies CircleInvite, 201),
  );

  routes.post(CIRCLES_API.merge, signedIn, async (c) => {
    const { into, keepNameOf } = await readBody(
      c,
      MergeCirclesRequest,
      "Choisis le cercle à réunir et le nom à garder.",
    );
    circles.merge(c.var.account.id, c.req.param("id"), into, keepNameOf);
    return c.json({ id: into } satisfies CreateCircleResponse);
  });

  return routes;
}
