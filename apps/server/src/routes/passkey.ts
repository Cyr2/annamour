import { type AccountResponse, API, PasskeyLoginVerifyRequest, PasskeyRegisterVerifyRequest } from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, type RouteDeps, readBody, requireAccount, setSessionCookie } from "../http/context.ts";

const RETRY = "Réessaie avec ta passkey, ou connecte-toi avec tes 4 mots.";

export function passkeyRoutes({ services, http }: RouteDeps) {
  const { accounts, passkeys } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.post(API.passkeyRegisterOptions, signedIn, async (c) =>
    c.json(await passkeys.registrationOptions(c.var.account)),
  );

  routes.post(API.passkeyRegisterVerify, signedIn, async (c) => {
    const { response } = await readBody(c, PasskeyRegisterVerifyRequest, RETRY);
    await passkeys.verifyRegistration(c.var.account.id, response);
    return c.json({ account: accounts.get(c.var.account.id) } satisfies AccountResponse);
  });

  routes.post(API.passkeyLoginOptions, async (c) => c.json(await passkeys.loginOptions()));

  routes.post(API.passkeyLoginVerify, async (c) => {
    const { response } = await readBody(c, PasskeyLoginVerifyRequest, RETRY);
    const accountId = await passkeys.verifyLogin(response);
    const { account, sessionToken } = accounts.signIn(accountId);
    setSessionCookie(c, sessionToken, http);
    return c.json({ account } satisfies AccountResponse);
  });

  return routes;
}
