import { isRoomCode, PlaybackReport, type PlaybackStatsList, type SeanceReport } from "@annamour/protocol";
import { Hono } from "hono";
import { type AppEnv, clientIp, type RouteDeps, readBody } from "../http/context.ts";

const ROOM_GONE = { error: "Cette séance n'existe plus." };

/** Playback reports: each device sends how the film played (navigator.sendBeacon), anyone with the code reads them. */
export function statsRoutes({ services }: RouteDeps) {
  const { playbackStats } = services;
  const routes = new Hono<AppEnv>();

  routes.post("/api/rooms/:code/stats", async (c) => {
    const code = c.req.param("code");
    if (!isRoomCode(code)) return c.json(ROOM_GONE, 404);
    const report = await readBody(c, PlaybackReport, "Rapport de lecture illisible.");
    const result = playbackStats.record(code, report, clientIp(c));
    if (result === "unknown_room") return c.json(ROOM_GONE, 404);
    if (result === "too_many") return c.json({ error: "Trop de rapports, réessaie dans une minute." }, 429);
    return c.body(null, 204);
  });

  routes.get("/api/rooms/:code/stats", (c) => {
    const code = c.req.param("code");
    if (!isRoomCode(code)) return c.json(ROOM_GONE, 404);
    return c.json({ reports: playbackStats.list(code) } satisfies PlaybackStatsList, 200, {
      "cache-control": "no-store",
    });
  });

  // The evening at a glance (« Qualité de la séance »): per person and device, against the targets.
  routes.get("/api/rooms/:code/report", (c) => {
    const code = c.req.param("code");
    const report = isRoomCode(code) ? playbackStats.report(code) : undefined;
    if (!report) return c.json(ROOM_GONE, 404);
    return c.json(report satisfies SeanceReport, 200, { "cache-control": "no-store" });
  });

  return routes;
}
