import {
  API,
  ApproveTvPairingRequest,
  type CreateTvPairingResponse,
  TvPairingCode,
  type TvPairingStatusResponse,
  TvPollToken,
} from "@annamour/protocol";
import { Hono } from "hono";
import { BadRequestError } from "../errors.ts";
import { type AppEnv, clientIp, type RouteDeps, readBody, requireAccount, setSessionCookie } from "../http/context.ts";

const CODE_HINT = "Saisis les 6 caractères affichés sur la TV, par exemple K7P-2QX.";

export function tvPairingRoutes({ services, http }: RouteDeps) {
  const { accounts, tvPairings } = services;
  const routes = new Hono<AppEnv>();
  const signedIn = requireAccount(accounts);

  routes.post(API.tvPairing, (c) => c.json(tvPairings.create(clientIp(c)) satisfies CreateTvPairingResponse, 201));

  routes.post(API.tvPairingApprove, signedIn, async (c) => {
    const { code } = await readBody(c, ApproveTvPairingRequest, CODE_HINT);
    tvPairings.approve(code, c.var.account.id, clientIp(c));
    return c.json({ status: "approved" } satisfies TvPairingStatusResponse);
  });

  routes.get(API.tvPairingCode, signedIn, (c) => {
    const code = TvPairingCode.safeParse(c.req.param("code"));
    if (!code.success) throw new BadRequestError(CODE_HINT);
    return c.json({ status: tvPairings.codeStatus(code.data, clientIp(c)) } satisfies TvPairingStatusResponse);
  });

  routes.get(API.tvPairingPoll, (c) => {
    const pollToken = TvPollToken.safeParse(c.req.param("pollToken"));
    if (!pollToken.success) throw new BadRequestError("Ce lien de TV n'est pas valide. Affiche un nouveau code.");
    const result = tvPairings.poll(pollToken.data);
    if (result.status === "approved") setSessionCookie(c, result.signedIn.sessionToken, http);
    // Every poll reflects the latest state: never let a cache answer for the server.
    c.header("cache-control", "no-store");
    return c.json({ status: result.status } satisfies TvPairingStatusResponse);
  });

  return routes;
}
