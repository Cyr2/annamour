import { Account, AccountKey, type BubbleColor, type UpdateAccountRequest } from "@annamour/protocol";
import { create } from "zustand";
import * as accounts from "../../api/accounts.ts";
import * as passkeys from "../../api/passkeys.ts";
import { readStored, removeStored, writeStored } from "../../lib/storage.ts";
import { useIdentity } from "../../sync/identity.ts";

/*
 * Who is signed in on this device. The account is cached so the app opens
 * instantly (and offline); the server's answer to /api/me then confirms it.
 * The 4-word key is kept on this device only so the profile can show it again.
 */

const ACCOUNT_STORAGE = "annamour:account:v1";
const KEY_STORAGE = "annamour:key:v1";

export type AccountStatus = "checking" | "guest" | "member";

export interface AccountState {
  status: AccountStatus;
  account: Account | null;
  key: AccountKey | null;
}

function initialState(): AccountState {
  const account = readStored(ACCOUNT_STORAGE, Account);
  return { status: account ? "member" : "checking", account, key: readStored(KEY_STORAGE, AccountKey) };
}

export const useAccount = create<AccountState>()(() => initialState());

function signIn(account: Account): Account {
  writeStored(ACCOUNT_STORAGE, account);
  useAccount.setState({ status: "member", account });
  // The bubble shown in rooms is the account's.
  const identity = useIdentity.getState();
  identity.setName(account.name);
  identity.setColor(account.color);
  return account;
}

function signOut(): void {
  removeStored(ACCOUNT_STORAGE);
  removeStored(KEY_STORAGE);
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
  writeStored(KEY_STORAGE, key);
  useAccount.setState({ key });
  signIn(account);
  return key;
}

export async function loginWithKey(key: AccountKey): Promise<Account> {
  const account = await accounts.loginWithKey(key);
  writeStored(KEY_STORAGE, key);
  useAccount.setState({ key });
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
