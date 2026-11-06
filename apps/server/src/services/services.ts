import type { DatabaseSync } from "node:sqlite";
import { RoomStore } from "../room-store.ts";
import { safeFetchText, type TextFetcher } from "../safe-fetch.ts";
import { createRepositories } from "../storage/repositories.ts";
import { AccountService } from "./account-service.ts";
import { HistoryService } from "./history-service.ts";
import { PasskeyService, type RelyingParty, type WebAuthn } from "./passkey-service.ts";
import { RoomService } from "./room-service.ts";
import type { RandomInt } from "./secrets.ts";

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
  webAuthn?: WebAuthn;
}

export interface Services {
  store: RoomStore;
  rooms: RoomService;
  accounts: AccountService;
  passkeys: PasskeyService;
  history: HistoryService;
  now: () => number;
}

/** Wires every service to one database: the single place where dependencies are chosen. */
export function createServices(options: ServiceOptions): Services {
  const { db, pepper, relyingParty, now = Date.now, fetchText = safeFetchText } = options;
  const repositories = createRepositories(db);
  const store = new RoomStore(repositories.rooms, { now, random: options.random });
  const history = new HistoryService({ repositories, store, now });
  return {
    store,
    history,
    rooms: new RoomService({ store, history, fetchText, now }),
    accounts: new AccountService({ repositories, pepper, now, randomInt: options.randomInt }),
    passkeys: new PasskeyService({ repositories, relyingParty, now, webAuthn: options.webAuthn }),
    now,
  };
}
