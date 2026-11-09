import {
  type Account,
  type AccountKey,
  AccountResponse,
  API,
  apiPath,
  type BubbleColor,
  CreateAccountResponse,
  KeyCheckResponse,
  LinkToken,
  NewKeyResponse,
  SessionList,
  type SessionSummary,
  type UpdateAccountRequest,
} from "@annamour/protocol";
import { z } from "zod/mini";
import { ApiRequestError, request } from "./http.ts";

/* Accounts: a 4-word key is the account; a session cookie keeps this device signed in. */

const UNAVAILABLE = "Les comptes ne sont pas encore disponibles sur ce serveur.";
const Ignored = z.unknown();

export async function createAccount(name: string, color: BubbleColor): Promise<CreateAccountResponse> {
  return request(CreateAccountResponse, API.createAccount, {
    body: { name, color },
    messages: { 400: "Choisis un prénom de 1 à 24 lettres.", 404: UNAVAILABLE },
  });
}

export async function loginWithKey(key: AccountKey): Promise<Account> {
  const { account } = await request(AccountResponse, API.loginWithKey, {
    body: { key },
    messages: {
      400: "Chaque mot de la clé ne contient que des lettres.",
      401: "Cette clé ne correspond à aucun compte. Vérifie l'ordre des mots.",
      404: "Cette clé ne correspond à aucun compte. Vérifie l'ordre des mots.",
      429: "Trop d'essais avec ce réseau. Réessaie dans une heure.",
    },
  });
  return account;
}

export async function linkWithToken(token: string): Promise<Account> {
  const { account } = await request(AccountResponse, API.linkWithToken, {
    body: { token },
    messages: {
      400: "Ce lien de connexion est incomplet. Scanne à nouveau le QR code.",
      401: "Ce QR code a expiré ou a déjà servi. Affiches-en un nouveau sur ton autre appareil.",
      404: "Ce QR code a expiré ou a déjà servi. Affiches-en un nouveau sur ton autre appareil.",
      410: "Ce QR code a expiré ou a déjà servi. Affiches-en un nouveau sur ton autre appareil.",
    },
  });
  return account;
}

/** Whether these words are the key of the account this device is signed in to. */
export async function checkKey(key: AccountKey): Promise<boolean> {
  const { matches } = await request(KeyCheckResponse, API.checkKey, { body: { key } });
  return matches;
}

/** New words for the signed-in account; the previous ones stop working. */
export async function newKey(): Promise<AccountKey> {
  const { key } = await request(NewKeyResponse, API.newKey, { method: "POST" });
  return key;
}

/** The signed-in account, or null when this device has no session. */
export async function fetchMe(): Promise<Account | null> {
  try {
    const { account } = await request(AccountResponse, API.me);
    return account;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function logout(): Promise<void> {
  await request(Ignored, API.logout, { method: "POST" });
}

export async function createLinkToken(): Promise<LinkToken> {
  return request(LinkToken, API.linkToken, { method: "POST" });
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const { sessions } = await request(SessionList, API.sessions);
  return sessions;
}

/** Changes the prénom and/or bubble colour of the signed-in account. */
export async function updateAccount(changes: UpdateAccountRequest): Promise<Account> {
  const { account } = await request(AccountResponse, API.me, {
    method: "PATCH",
    body: changes,
    messages: { 400: "Choisis un prénom de 1 à 24 lettres." },
  });
  return account;
}

/** Adds a séance watched as a guest to my séances, now that I have an account. */
export async function keepSession(code: string): Promise<void> {
  await request(Ignored, apiPath(API.session, { code }), { method: "POST" });
}

/** Leaves a séance: gone from my séances and my circles; the others keep it. */
export async function leaveSession(code: string): Promise<void> {
  await request(Ignored, apiPath(API.session, { code }), { method: "DELETE" });
}

/** Deletes a séance for everyone (only the person who created it may). */
export async function deleteSessionForEveryone(code: string): Promise<void> {
  await request(Ignored, apiPath(API.sessionForEveryone, { code }), { method: "DELETE" });
}
