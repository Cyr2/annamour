import { Account, AccountKey, type BubbleColor, type UpdateAccountRequest } from "@annamour/protocol";
import { z } from "zod/mini";
import { create } from "zustand";
import * as accounts from "../../api/accounts.ts";
import * as passkeys from "../../api/passkeys.ts";
import { readStored, removeStored, writeStored } from "../../lib/storage.ts";
import { useIdentity } from "../../sync/identity.ts";
import { resetCircles } from "../circles/circles.ts";
import { resetSessions } from "../sessions/sessions.ts";
import { resetWatchlist } from "../watchlist/watchlist.ts";

/*
 * Who is signed in on this device. The account is cached so the app opens
 * instantly (and offline); the server's answer to /api/me then confirms it.
 * The 4-word key is kept on this device only so the profile can show it again,
 * always with the account it opens: a device that moves to another account (QR
 * code, Face ID) must never show the previous account's words as its key.
 */

const ACCOUNT_STORAGE = "annamour:account:v1";
const KEY_STORAGE = "annamour:key:v2";
/** Words saved before they were tied to an account: shown only once the server confirms them. */
const UNCHECKED_KEY_STORAGE = "annamour:key:v1";

const StoredKey = z.object({ accountId: z.string(), words: AccountKey });

export type AccountStatus = "checking" | "guest" | "member";

export interface AccountState {
  status: AccountStatus;
  account: Account | null;
  key: AccountKey | null;
}

/** The words this device keeps for this account, if they are this account's. */
function keyFor(account: Account | null): AccountKey | null {
  const stored = readStored(KEY_STORAGE, StoredKey);
  return account && stored?.accountId === account.id ? stored.words : null;
}

function keepKey(account: Account, words: AccountKey): void {
  writeStored(KEY_STORAGE, { accountId: account.id, words });
  removeStored(UNCHECKED_KEY_STORAGE);
  useAccount.setState({ key: words });
}

function initialState(): AccountState {
  const account = readStored(ACCOUNT_STORAGE, Account);
  return { status: account ? "member" : "checking", account, key: keyFor(account) };
}

export const useAccount = create<AccountState>()(() => initialState());

/** Another account on this device: never show the previous one's séances, circles or list. */
function forgetAccountData(): void {
  resetSessions();
  resetWatchlist();
  resetCircles();
}

function signIn(account: Account): Account {
  const previous = useAccount.getState().account;
  if (previous && previous.id !== account.id) forgetAccountData();
  writeStored(ACCOUNT_STORAGE, account);
  useAccount.setState({ status: "member", account, key: keyFor(account) });
  void checkUncheckedKey(account);
  // The bubble shown in rooms is the account's.
  const identity = useIdentity.getState();
  identity.setName(account.name);
  identity.setColor(account.color);
  return account;
}

/** Old words get shown again only if the server says they open this very account. */
async function checkUncheckedKey(account: Account): Promise<void> {
  const words = readStored(UNCHECKED_KEY_STORAGE, AccountKey);
  if (!words) return;
  try {
    const matches = await accounts.checkKey(words);
    if (useAccount.getState().account?.id !== account.id) return;
    if (matches) keepKey(account, words);
    else removeStored(UNCHECKED_KEY_STORAGE);
  } catch {
    // Offline or too many tries: asked again next time.
  }
}

function signOut(): void {
  forgetAccountData();
  removeStored(ACCOUNT_STORAGE);
  removeStored(KEY_STORAGE);
  removeStored(UNCHECKED_KEY_STORAGE);
  useAccount.setState({ status: "guest", account: null, key: null });
}

/** Asks the server who this device is. Offline, the cached account stays. */
export async function refreshAccount(): Promise<void> {
  try {
    const account = await accounts.fetchMe();
    if (account) signIn(account);
    else signOut();
  } catch {
    if (useAccount.getState().status === "checking") useAccount.setState({ status: "guest" });
  }
}

export async function createAccount(name: string, color: BubbleColor): Promise<AccountKey> {
  const { account, key } = await accounts.createAccount(name, color);
  keepKey(account, key);
  signIn(account);
  return key;
}

export async function loginWithKey(key: AccountKey): Promise<Account> {
  const account = await accounts.loginWithKey(key);
  keepKey(account, key);
  return signIn(account);
}

export async function linkWithToken(token: string): Promise<Account> {
  return signIn(await accounts.linkWithToken(token));
}

export async function loginWithPasskey(): Promise<Account> {
  return signIn(await passkeys.loginWithPasskey());
}

export async function registerPasskey(): Promise<void> {
  await passkeys.registerPasskey();
  const { account } = useAccount.getState();
  if (account) signIn({ ...account, hasPasskey: true });
}

/** Saves a new prénom or colour on the account; the room bubble follows. */
export async function updateProfile(changes: UpdateAccountRequest): Promise<Account> {
  return signIn(await accounts.updateAccount(changes));
}

/** Ends this device's session on the server, then forgets the account and its key here. */
export async function logout(): Promise<void> {
  await accounts.logout();
  signOut();
}
