import { randomUUID } from "node:crypto";
import {
  type Account,
  type AccountKey,
  type BubbleColor,
  KEY_LOGIN_LIMIT,
  LINK_TOKEN_TTL_MS,
  type LinkToken,
  type UpdateAccountRequest,
} from "@annamour/protocol";
import { InvalidKeyError, InvalidLinkTokenError, NotSignedInError, TooManyAttemptsError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { generateAccountKey, hashAccountKey, hashToken, type RandomInt, randomToken } from "./secrets.ts";

/** Browsers cap cookies at 400 days: a device stays signed in that long. */
export const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;

export interface SignedIn {
  account: Account;
  /** Goes into the session cookie; only its hash is stored. */
  sessionToken: string;
}

export interface AccountServiceOptions {
  repositories: Pick<Repositories, "accounts" | "authSessions" | "linkTokens">;
  pepper: string;
  now: () => number;
  randomInt?: RandomInt;
}

/** Accounts without email or password: the 4-word key is the account. */
export class AccountService {
  private readonly repositories: AccountServiceOptions["repositories"];
  private readonly pepper: string;
  private readonly now: () => number;
  private readonly randomInt: RandomInt | undefined;
  private readonly keyAttempts = new RateLimiter(KEY_LOGIN_LIMIT);

  constructor({ repositories, pepper, now, randomInt }: AccountServiceOptions) {
    this.repositories = repositories;
    this.pepper = pepper;
    this.now = now;
    this.randomInt = randomInt;
  }

  create(name: string, color: BubbleColor): SignedIn & { key: string[] } {
    const { key, keyHash } = this.freshKey();
    const id = randomUUID();
    this.repositories.accounts.insert({ id, keyHash, name, color, createdAt: this.now() });
    return { ...this.signIn(id), key };
  }

  loginWithKey(key: AccountKey, clientIp: string): SignedIn {
    if (!this.keyAttempts.tryAcquire(clientIp, this.now())) throw new TooManyAttemptsError();
    const account = this.repositories.accounts.findByKeyHash(hashAccountKey(key, this.pepper));
    if (!account) throw new InvalidKeyError();
    return this.signIn(account.id);
  }

  /**
   * Whether these 4 words open this account. A device that changed account by QR code or
   * Face ID may still hold the previous account's words: it asks before showing them.
   * Counted like a login, so it never helps guessing keys.
   */
  isKeyOf(accountId: string, key: AccountKey, clientIp: string): boolean {
    if (!this.keyAttempts.tryAcquire(clientIp, this.now())) throw new TooManyAttemptsError();
    return this.repositories.accounts.findByKeyHash(hashAccountKey(key, this.pepper))?.id === accountId;
  }

  /** Opens a new device session for this account. */
  signIn(accountId: string): SignedIn {
    const account = this.get(accountId);
    const sessionToken = randomToken();
    const now = this.now();
    this.repositories.authSessions.insert(hashToken(sessionToken), accountId, now, now + SESSION_TTL_MS);
    return { account, sessionToken };
  }

  /** The account behind a session cookie, if it is still valid. */
  accountFor(sessionToken: string | undefined): Account | undefined {
    if (!sessionToken) return undefined;
    const accountId = this.repositories.authSessions.findAccountId(hashToken(sessionToken), this.now());
    return accountId === undefined ? undefined : this.repositories.accounts.findById(accountId);
  }

  update(accountId: string, changes: UpdateAccountRequest): Account {
    this.repositories.accounts.update(accountId, changes);
    return this.get(accountId);
  }

  logout(sessionToken: string | undefined): void {
    if (sessionToken) this.repositories.authSessions.delete(hashToken(sessionToken));
  }

  createLinkToken(accountId: string): LinkToken {
    const token = randomToken();
    const expiresAt = this.now() + LINK_TOKEN_TTL_MS;
    this.repositories.linkTokens.insert(hashToken(token), accountId, expiresAt);
    return { token, expiresAt };
  }

  linkWithToken(token: string): SignedIn {
    const accountId = this.repositories.linkTokens.consume(hashToken(token), this.now());
    if (accountId === undefined) throw new InvalidLinkTokenError();
    return this.signIn(accountId);
  }

  /** Forgets expired device sessions and QR codes. */
  sweep(): void {
    const now = this.now();
    this.repositories.authSessions.deleteExpired(now);
    this.repositories.linkTokens.deleteExpired(now);
  }

  get(accountId: string): Account {
    const account = this.repositories.accounts.findById(accountId);
    if (!account) throw new NotSignedInError();
    return account;
  }

  /** 44 bits make a collision very unlikely, but two accounts must never share a key. */
  private freshKey(): { key: string[]; keyHash: string } {
    for (;;) {
      const key = generateAccountKey(this.randomInt);
      const keyHash = hashAccountKey(key, this.pepper);
      if (!this.repositories.accounts.keyHashExists(keyHash)) return { key, keyHash };
    }
  }
}
