import { resolve } from "node:path";
import type { RelyingParty } from "./services/passkey-service.ts";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ServerConfig {
  port: number;
  production: boolean;
  webDist: string;
  /** Where annamour.db lives: a persistent volume in production. */
  dataDir: string;
  /** Secret mixed into every key hash; never stored next to the database. */
  pepper: string;
  relyingParty: RelyingParty;
  /** naka-bridge, for searching films by name; absent, séances start from a pasted link. */
  nakaBridge: { url: string; secret: string } | undefined;
}

function nakaBridge(env: NodeJS.ProcessEnv): ServerConfig["nakaBridge"] {
  const url = env.NAKA_BRIDGE_URL?.trim();
  const secret = env.NAKA_BRIDGE_SECRET?.trim();
  if (!url && !secret) return undefined;
  if (!url || !secret)
    throw new ConfigError("NAKA_BRIDGE_URL and NAKA_BRIDGE_SECRET go together: set both or neither.");
  return { url, secret };
}

/** Only for local development and tests: production refuses to start without its own. */
export const DEV_PEPPER = "annamour-dev-pepper-not-secret";

function origins(value: string | undefined): string[] {
  const list = (value ?? "").split(",").map((origin) => origin.trim());
  const filled = list.filter((origin) => origin.length > 0);
  return filled.length > 0 ? filled : ["http://localhost:5173"];
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const production = env.NODE_ENV === "production";
  const pepper = env.KEY_PEPPER?.trim();
  if (production && !pepper) throw new ConfigError("KEY_PEPPER is required in production: set it in Coolify.");
  return {
    port: Number(env.PORT ?? 8787),
    production,
    webDist: resolve(env.WEB_DIST ?? "../web/dist"),
    dataDir: resolve(env.DATA_DIR ?? "./data"),
    pepper: pepper || DEV_PEPPER,
    relyingParty: { id: env.RP_ID?.trim() || "localhost", name: "Annamour", origins: origins(env.ORIGIN) },
    nakaBridge: nakaBridge(env),
  };
}
