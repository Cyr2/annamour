import {
  type Account,
  type AccountKey,
  AccountResponse,
  API,
  type BubbleColor,
  CreateAccountResponse,
  LinkToken,
  SessionList,
  type SessionSummary,
} from "@annamour/protocol";
import { z } from "zod";
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
