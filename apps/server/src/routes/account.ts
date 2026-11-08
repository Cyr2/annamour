import {
  type AccountResponse,
  API,
  CreateAccountRequest,
  type CreateAccountResponse,
  type KeyCheckResponse,
  LinkWithTokenRequest,
  LoginWithKeyRequest,
  type NewKeyResponse,
  UpdateAccountRequest,
} from "@annamour/protocol";
import { Hono } from "hono";
import {
  type AppEnv,
  clearSessionCookie,
  clientIp,
  type RouteDeps,
  readBody,
  requireAccount,
  sessionToken,
  setSessionCookie,
} from "../http/context.ts";

export function accountRoutes({ services, http }: RouteDeps) {
  const { accounts } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.post(API.createAccount, async (c) => {
    const { name, color } = await readBody(c, CreateAccountRequest, "Choisis un prénom et une couleur.");
    const { account, key, sessionToken: token } = accounts.create(name, color);
    setSessionCookie(c, token, http);
    return c.json({ account, key } satisfies CreateAccountResponse, 201);
  });

  routes.post(API.loginWithKey, async (c) => {
    const { key } = await readBody(c, LoginWithKeyRequest, "Saisis les 4 mots de ta clé, séparés par des espaces.");
    const { account, sessionToken: token } = accounts.loginWithKey(key, clientIp(c));
    setSessionCookie(c, token, http);
    return c.json({ account } satisfies AccountResponse);
  });

  routes.post(API.linkWithToken, async (c) => {
    const { token } = await readBody(c, LinkWithTokenRequest, "Scanne à nouveau le QR code de ton autre appareil.");
    const { account, sessionToken: session } = accounts.linkWithToken(token);
    setSessionCookie(c, session, http);
    return c.json({ account } satisfies AccountResponse);
  });

  routes.post(API.logout, (c) => {
    accounts.logout(sessionToken(c));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  routes.get(API.me, signedIn, (c) => c.json({ account: c.var.account } satisfies AccountResponse));

  routes.patch(API.me, signedIn, async (c) => {
    const changes = await readBody(
      c,
      UpdateAccountRequest,
      "Choisis un prénom (24 caractères au plus) ou une couleur.",
    );
    return c.json({ account: accounts.update(c.var.account.id, changes) } satisfies AccountResponse);
  });

  routes.post(API.checkKey, signedIn, async (c) => {
    const { key } = await readBody(c, LoginWithKeyRequest, "Saisis les 4 mots de ta clé, séparés par des espaces.");
    const matches = accounts.isKeyOf(c.var.account.id, key, clientIp(c));
    return c.json({ matches } satisfies KeyCheckResponse);
  });

  routes.post(API.newKey, signedIn, (c) =>
    c.json({ key: accounts.newKey(c.var.account.id) } satisfies NewKeyResponse, 201),
  );

  routes.post(API.linkToken, signedIn, (c) => c.json(accounts.createLinkToken(c.var.account.id), 201));

  return routes;
}
