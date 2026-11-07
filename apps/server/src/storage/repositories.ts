import type { DatabaseSync } from "node:sqlite";
import { AccountRepository } from "./account-repository.ts";
import { AuthSessionRepository, LinkTokenRepository } from "./auth-repository.ts";
import { ParticipationRepository } from "./participation-repository.ts";
import { PasskeyRepository } from "./passkey-repository.ts";
import { RoomRepository } from "./room-repository.ts";
import { TvPairingRepository } from "./tv-pairing-repository.ts";

/** The only way to reach the database: services get these, never the connection. */
export interface Repositories {
  rooms: RoomRepository;
  accounts: AccountRepository;
  authSessions: AuthSessionRepository;
  linkTokens: LinkTokenRepository;
  passkeys: PasskeyRepository;
  participations: ParticipationRepository;
  tvPairings: TvPairingRepository;
}

export function createRepositories(db: DatabaseSync): Repositories {
  return {
    rooms: new RoomRepository(db),
    accounts: new AccountRepository(db),
    authSessions: new AuthSessionRepository(db),
    linkTokens: new LinkTokenRepository(db),
    passkeys: new PasskeyRepository(db),
    participations: new ParticipationRepository(db),
    tvPairings: new TvPairingRepository(db),
  };
}
