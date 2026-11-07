import type { DatabaseSync } from "node:sqlite";
import type { Catalog } from "../catalog/naka-catalog.ts";
import type { TimelineProbe } from "../media/timeline-probe.ts";
import type { Transcoder } from "../media/transcoder.ts";
import { RoomStore } from "../room-store.ts";
import { safeFetchText, type TextFetcher } from "../safe-fetch.ts";
import { createRepositories } from "../storage/repositories.ts";
import { AccountService } from "./account-service.ts";
import { CatalogService } from "./catalog-service.ts";
import { CircleService } from "./circle-service.ts";
import { HistoryService } from "./history-service.ts";
import { LowQualityService } from "./low-quality-service.ts";
import { PasskeyService, type RelyingParty, type WebAuthn } from "./passkey-service.ts";
import { PlaybackStatsService } from "./playback-stats-service.ts";
import { RoomService } from "./room-service.ts";
import type { RandomInt } from "./secrets.ts";
import { TvPairingService } from "./tv-pairing-service.ts";
import { WatchlistService } from "./watchlist-service.ts";

export interface ServiceOptions {
  db: DatabaseSync;
  pepper: string;
  relyingParty: RelyingParty;
  now?: () => number;
  fetchText?: TextFetcher;
  /** Room code draws (tests make them predictable). */
  random?: () => number;
  /** Key word draws (tests make them predictable). */
  randomInt?: RandomInt;
  /** TV pairing code draws (tests make them predictable). */
  tvCodeRandomInt?: RandomInt;
  webAuthn?: WebAuthn;
  /** Films and series to search by name (Naka through naka-bridge); absent, séances start from a link. */
  catalog?: Catalog;
  /** Makes lighter qualities of each film (needs ffmpeg); absent, séances keep their source's only quality. */
  transcoder?: Transcoder;
  /** What the lighter qualities of every séance may take on disk together. */
  mediaMaxBytes?: number;
  /** Logs how each film's source audio lines up with its video. */
  timelineProbe?: TimelineProbe;
}

export interface Services {
  store: RoomStore;
  rooms: RoomService;
  accounts: AccountService;
  passkeys: PasskeyService;
  history: HistoryService;
  tvPairings: TvPairingService;
  catalog: CatalogService;
  watchlist: WatchlistService;
  circles: CircleService;
  lowQualities: LowQualityService;
  playbackStats: PlaybackStatsService;
  now: () => number;
}

/** Wires every service to one database: the single place where dependencies are chosen. */
export function createServices(options: ServiceOptions): Services {
  const { db, pepper, relyingParty, now = Date.now, fetchText = safeFetchText } = options;
  const repositories = createRepositories(db);
  const store = new RoomStore(repositories.rooms, { now, random: options.random });
  const circles = new CircleService({ repositories, now });
  // Séances made before circles existed find theirs.
  circles.backfill();
  const history = new HistoryService({ repositories, store, now, onParticipation: (code) => circles.syncRoom(code) });
  const accounts = new AccountService({ repositories, pepper, now, randomInt: options.randomInt });
  const lowQualities = new LowQualityService({
    store,
    transcoder: options.transcoder,
    now,
    ...(options.timelineProbe ? { probe: options.timelineProbe } : {}),
    ...(options.mediaMaxBytes ? { maxBytes: options.mediaMaxBytes } : {}),
  });
  // A new séance starts being prepared at once: by the time someone opens it, the first minute is ready.
  const rooms = new RoomService({
    store,
    history,
    fetchText,
    now,
    onCreated: (code) => {
      lowQualities.prep(code).catch((error: unknown) => console.warn("Could not start preparing", code, error));
    },
    // A queued episode is made ready behind the current one, so moving on to it starts at once.
    onEpisodeAdded: (code) => lowQualities.prepareNext(code),
  });
  return {
    store,
    history,
    rooms,
    catalog: new CatalogService({ catalog: options.catalog, rooms, now }),
    accounts,
    tvPairings: new TvPairingService({ repositories, accounts, now, randomInt: options.tvCodeRandomInt }),
    passkeys: new PasskeyService({ repositories, relyingParty, now, webAuthn: options.webAuthn }),
    watchlist: new WatchlistService({ repositories, now }),
    circles,
    playbackStats: new PlaybackStatsService({ repositories, now }),
    lowQualities,
    now,
  };
}
