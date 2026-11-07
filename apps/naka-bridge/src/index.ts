import { createServer } from "node:http";
import { handleBridgeRequest } from "./bridge.ts";
import { CallBudget } from "./budget.ts";
import { NakaPage } from "./naka-page.ts";

/*
 * naka-bridge: lets the Annamour server search Naka and get a title's video
 * link. Reachable only on the Docker network, behind a shared secret.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required: set it in Coolify.`);
  return value;
}

const naka = new NakaPage({ token: required("NAKA_TOKEN"), profileId: required("NAKA_PROFILE") });
const deps = {
  secret: required("BRIDGE_SECRET"),
  naka,
  // Far below Naka's own limit (30 a minute): a search and a play are two calls.
  budget: new CallBudget({ max: 20, windowMs: 60_000 }),
  now: Date.now,
};

const server = createServer(async (req, res) => {
  const header = req.headers["x-bridge-secret"];
  const answer = await handleBridgeRequest(
    { method: req.method ?? "GET", target: req.url ?? "/", secret: Array.isArray(header) ? header[0] : header },
    deps,
  );
  res.writeHead(answer.status, { "content-type": "application/json; charset=utf-8" });
  res.end(answer.body);
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, "0.0.0.0", () => console.info(`naka-bridge on :${port}`));

function shutdown(): void {
  server.close();
  void naka.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
