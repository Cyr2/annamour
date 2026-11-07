import { randomInt } from "node:crypto";
import {
  type CreateTvPairingResponse,
  formatTvPairingCode,
  generateTvPairingCode,
  TV_PAIRING_APPROVE_LIMIT,
  TV_PAIRING_CREATE_LIMIT,
  TV_PAIRING_TTL_MS,
  type TvPairingStatus,
} from "@annamour/protocol";
import { ExpiredTvCodeError, TooManyAttemptsError, UnknownTvCodeError, UsedTvCodeError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";
import type { TvPairing } from "../storage/tv-pairing-repository.ts";
import type { AccountService, SignedIn } from "./account-service.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { hashToken, type RandomInt, randomToken } from "./secrets.ts";

export interface TvPairingServiceOptions {
  repositories: Pick<Repositories, "tvPairings">;
  accounts: Pick<AccountService, "signIn">;
  now: () => number;
  randomInt?: RandomInt;
}

export type TvPairingPoll = { status: "pending" | "expired" } | { status: "approved"; signedIn: SignedIn };

const TOO_MANY_ATTEMPTS = "Trop d'essais depuis cette connexion. Réessaie dans une heure.";

/**
 * Links a TV without typing on it: the TV shows a short code, a signed-in
 * phone approves it, and the TV's next poll opens a session on that account.
 */
export class TvPairingService {
  private readonly repository: Repositories["tvPairings"];
  private readonly accounts: TvPairingServiceOptions["accounts"];
  private readonly now: () => number;
  private readonly randomInt: RandomInt;
  private readonly createAttempts = new RateLimiter(TV_PAIRING_CREATE_LIMIT);
  private readonly codeAttempts = new RateLimiter(TV_PAIRING_APPROVE_LIMIT);

  constructor({ repositories, accounts, now, randomInt: random = randomInt }: TvPairingServiceOptions) {
    this.repository = repositories.tvPairings;
    this.accounts = accounts;
    this.now = now;
    this.randomInt = random;
  }

  create(clientIp: string): CreateTvPairingResponse {
    const now = this.now();
    if (!this.createAttempts.tryAcquire(clientIp, now)) throw new TooManyAttemptsError(TOO_MANY_ATTEMPTS);
    const code = this.freshCode(now);
    const pollToken = randomToken();
    const expiresAt = now + TV_PAIRING_TTL_MS;
    this.repository.insert(hashToken(pollToken), hashToken(code), expiresAt);
    return { code: formatTvPairingCode(code), pollToken, expiresAt };
  }

  /** What the TV learns at each poll; an approved pairing hands out its session once. */
  poll(pollToken: string): TvPairingPoll {
    const pollTokenHash = hashToken(pollToken);
    const status = this.statusOf(this.repository.findByPollToken(pollTokenHash));
    if (status !== "approved") return { status };
    const accountId = this.repository.consume(pollTokenHash);
    if (accountId === undefined) return { status: "expired" };
    return { status: "approved", signedIn: this.accounts.signIn(accountId) };
  }

  /** For the phone's confirmation screen, before approving. `code` is normalized. */
  codeStatus(code: string, clientIp: string): TvPairingStatus {
    const pairing = this.findCode(code, clientIp);
    if (pairing.expiresAt <= this.now()) return "expired";
    return pairing.state === "pending" ? "pending" : "approved";
  }

  /** Links the TV showing `code` (normalized) to the phone's account. */
  approve(code: string, accountId: string, clientIp: string): void {
    const pairing = this.findCode(code, clientIp);
    if (pairing.expiresAt <= this.now()) throw new ExpiredTvCodeError();
    if (pairing.state !== "pending" || !this.repository.approve(pairing.pollTokenHash, accountId)) {
      throw new UsedTvCodeError();
    }
  }

  /** Forgets pairings past their 10 minutes. */
  sweep(): void {
    this.repository.deleteExpired(this.now());
  }

  private findCode(code: string, clientIp: string): TvPairing {
    if (!this.codeAttempts.tryAcquire(clientIp, this.now())) throw new TooManyAttemptsError(TOO_MANY_ATTEMPTS);
    const pairing = this.repository.findByCode(hashToken(code));
    if (!pairing) throw new UnknownTvCodeError();
    return pairing;
  }

  private statusOf(pairing: TvPairing | undefined): TvPairingStatus {
    if (!pairing || pairing.expiresAt <= this.now() || pairing.state === "consumed") return "expired";
    return pairing.state;
  }

  private freshCode(now: number): string {
    for (;;) {
      const code = generateTvPairingCode(this.randomInt);
      if (!this.repository.liveCodeExists(hashToken(code), now)) return code;
    }
  }
}
