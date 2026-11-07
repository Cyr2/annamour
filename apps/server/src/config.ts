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
  /** ffmpeg processes making lighter qualities at once (0 turns them off). */
  transcodeWorkers: number;
  /**
   * Lighter audio for the lowest rungs (LIGHT_AUDIO=on). Off by default: it
   * needs packed ADTS audio, and Naka's turned out not to be (see the timeline probe).
   */
  lightAudio: boolean;
  /**
   * Films may come from localhost over http (E2E_ALLOW_LOCAL_MEDIA=1): only
   * for the end-to-end tests' fake CDN; refused in production.
   */
  allowLocalMedia: boolean;
  /** What the lighter qualities of every séance may take on disk together, in GB (MEDIA_MAX_GB). */
  mediaMaxGb: number;
}

const DEFAULT_TRANSCODE_WORKERS = 2;

function transcodeWorkers(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_TRANSCODE_WORKERS;
  const workers = Number(value);
  if (!Number.isInteger(workers) || workers < 0 || workers > 16)
    throw new ConfigError("TRANSCODE_WORKERS is a whole number from 0 (off) to 16.");
  return workers;
}

const DEFAULT_MEDIA_MAX_GB = 50;

function mediaMaxGb(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MEDIA_MAX_GB;
  const gb = Number(value);
  if (!Number.isFinite(gb) || gb < 1 || gb > 100_000)
    throw new ConfigError("MEDIA_MAX_GB is a number of gigabytes from 1 to 100000.");
  return gb;
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
    transcodeWorkers: transcodeWorkers(env.TRANSCODE_WORKERS),
    lightAudio: env.LIGHT_AUDIO?.trim().toLowerCase() === "on",
    allowLocalMedia: allowLocalMedia(env, production),
    mediaMaxGb: mediaMaxGb(env.MEDIA_MAX_GB),
  };
}

/** The end-to-end tests serve their film from localhost; never a production server. */
function allowLocalMedia(env: NodeJS.ProcessEnv, production: boolean): boolean {
  const allowed = env.E2E_ALLOW_LOCAL_MEDIA?.trim() === "1";
  if (allowed && production) throw new ConfigError("E2E_ALLOW_LOCAL_MEDIA is for tests: never set it in production.");
  return allowed;
}
