import {
  AddCatalogEpisodeRequest,
  type AddEpisodeResponse,
  CATALOG_API,
  CatalogQuery,
  type CatalogSearchResponse,
  type CatalogSeasonResponse,
  type CreateRoomResponse,
  isRoomCode,
  PlayCatalogRequest,
} from "@annamour/protocol";
import { Hono } from "hono";
import { BadRequestError, NotFoundError, TooManyAttemptsError } from "../errors.ts";
import { type AppEnv, type RouteDeps, readBody, requireAccount } from "../http/context.ts";
import { RateLimiter } from "../services/rate-limiter.ts";
import { importing } from "./rooms.ts";

/** Per account: plenty for typing a name, far too few to drain Naka's budget alone. */
const CATALOG_LIMIT = { max: 30, windowMs: 60_000 };
const SEARCH_HELP = "Tape au moins deux lettres du titre.";

function positiveInt(value: string): number | null {
  return /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

/** Search the catalog and start a séance on a title: for signed-in people only. */
export function catalogRoutes({ services }: RouteDeps) {
  const { catalog, accounts, circles, now } = services;
  const limiter = new RateLimiter(CATALOG_LIMIT);
  const routes = new Hono<AppEnv>();

  routes.use("/api/catalog/*", requireAccount(accounts), async (c, next) => {
    if (!limiter.tryAcquire(c.get("account").id, now())) {
      throw new TooManyAttemptsError("Beaucoup de recherches d'un coup : réessaie dans une minute.");
    }
    await next();
  });

  routes.get(CATALOG_API.search, async (c) => {
    const query = CatalogQuery.safeParse(c.req.query("q") ?? "");
    if (!query.success) throw new BadRequestError(SEARCH_HELP);
    return c.json({ titles: await catalog.search(query.data) } satisfies CatalogSearchResponse);
  });

  routes.get(CATALOG_API.season, async (c) => {
    const id = positiveInt(c.req.param("id"));
    const season = positiveInt(c.req.param("season"));
    if (id === null || season === null) throw new BadRequestError("Cette saison n'existe pas.");
    return c.json({ episodes: await catalog.season(id, season) } satisfies CatalogSeasonResponse);
  });

  routes.post(CATALOG_API.addEpisode, async (c) => {
    const code = c.req.param("code");
    if (!isRoomCode(code)) throw new NotFoundError("Cette séance n'existe plus.");
    const request = await readBody(c, AddCatalogEpisodeRequest, "Choisis un film, ou un épisode d'une série.");
    const episode = await importing(catalog.addEpisode(code, request));
    return c.json({ episode } satisfies AddEpisodeResponse, 201);
  });

  routes.post(CATALOG_API.play, async (c) => {
    const request = await readBody(c, PlayCatalogRequest, "Choisis un film, ou un épisode d'une série.");
    const accountId = c.get("account").id;
    const room = await importing(catalog.play(request, accountId));
    // Started from a circle (« On regarde ? »): the séance is in it from the start.
    const circleId = c.req.query("cercle");
    if (circleId) circles.assignRoom(accountId, room.code, circleId);
    return c.json({ code: room.code } satisfies CreateRoomResponse, 201);
  });

  return routes;
}
