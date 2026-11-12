import type { DatabaseSync } from "node:sqlite";
import { AccountRepository } from "./account-repository.ts";
import { AuthSessionRepository, LinkTokenRepository } from "./auth-repository.ts";
import { CatalogCacheRepository } from "./catalog-cache-repository.ts";
import { CircleRepository } from "./circle-repository.ts";
import { DismissalRepository } from "./dismissal-repository.ts";
import { ParticipationRepository } from "./participation-repository.ts";
import { PasskeyRepository } from "./passkey-repository.ts";
import { PlaybackReportRepository } from "./playback-report-repository.ts";
import { RatingRepository } from "./rating-repository.ts";
import { RoomRepository } from "./room-repository.ts";
import { TvPairingRepository } from "./tv-pairing-repository.ts";
import { WatchlistRepository } from "./watchlist-repository.ts";

/** The only way to reach the database: services get these, never the connection. */
export interface Repositories {
  rooms: RoomRepository;
  accounts: AccountRepository;
  circles: CircleRepository;
  authSessions: AuthSessionRepository;
  linkTokens: LinkTokenRepository;
  passkeys: PasskeyRepository;
  participations: ParticipationRepository;
  tvPairings: TvPairingRepository;
  watchlist: WatchlistRepository;
  playbackReports: PlaybackReportRepository;
  ratings: RatingRepository;
  catalogCache: CatalogCacheRepository;
  dismissals: DismissalRepository;
}

export function createRepositories(db: DatabaseSync): Repositories {
  return {
    rooms: new RoomRepository(db),
    accounts: new AccountRepository(db),
    circles: new CircleRepository(db),
    authSessions: new AuthSessionRepository(db),
    linkTokens: new LinkTokenRepository(db),
    passkeys: new PasskeyRepository(db),
    participations: new ParticipationRepository(db),
    tvPairings: new TvPairingRepository(db),
    watchlist: new WatchlistRepository(db),
    playbackReports: new PlaybackReportRepository(db),
    ratings: new RatingRepository(db),
    catalogCache: new CatalogCacheRepository(db),
    dismissals: new DismissalRepository(db),
  };
}
