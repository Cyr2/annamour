import { type Account, API, WebAuthnJson } from "@annamour/protocol";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { z } from "zod/mini";
import { fetchMe } from "./accounts.ts";
import { ApiRequestError, request } from "./http.ts";

/*
 * Passkeys (Face ID, Touch ID, Windows Hello): an optional shortcut, the
 * 4-word key stays the way back in. The server's options are WebAuthn JSON
 * that SimpleWebAuthn validates itself, so they are only checked for shape.
 */

/** The browser ceremonies, injectable so the flow can be tested without an authenticator. */
export interface WebAuthnCeremonies {
  register: (optionsJSON: PublicKeyCredentialCreationOptionsJSON) => Promise<unknown>;
  authenticate: (optionsJSON: PublicKeyCredentialRequestOptionsJSON) => Promise<unknown>;
}

/** SimpleWebAuthn is only downloaded when a ceremony actually starts. */
const browserCeremonies: WebAuthnCeremonies = {
  register: async (optionsJSON) => (await import("@simplewebauthn/browser")).startRegistration({ optionsJSON }),
  authenticate: async (optionsJSON) => (await import("@simplewebauthn/browser")).startAuthentication({ optionsJSON }),
};

const CANCELLED = "C'est annulé. Tu peux réessayer quand tu veux.";
const UNSUPPORTED = "Cet appareil ne sait pas créer de clé d'accès.";
const Ignored = z.unknown();

/** The same check as SimpleWebAuthn's `browserSupportsWebAuthn`, without loading it. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/** The authenticator refused or the person closed the prompt: not worth a scary message. */
function ceremonyError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return new ApiRequestError(0, CANCELLED);
  if (name === "InvalidStateError") return new ApiRequestError(409, "Une clé d'accès existe déjà sur cet appareil.");
  return new ApiRequestError(0, UNSUPPORTED);
}

/** Registers a passkey for the signed-in account. */
export async function registerPasskey(ceremonies: WebAuthnCeremonies = browserCeremonies): Promise<void> {
  const options = await request(WebAuthnJson, API.passkeyRegisterOptions, {
    method: "POST",
    messages: { 401: "Crée d'abord ton compte, puis active la clé d'accès." },
  });
  let response: unknown;
  try {
    // SimpleWebAuthn checks the options in depth; zod only proved they are an object.
    response = await ceremonies.register(options as unknown as PublicKeyCredentialCreationOptionsJSON);
  } catch (error) {
    throw ceremonyError(error);
  }
  await request(Ignored, API.passkeyRegisterVerify, {
    body: { response },
    messages: { 400: "La clé d'accès n'a pas pu être vérifiée. Réessaie." },
  });
}

/** Signs this device in with a passkey and returns the account. */
export async function loginWithPasskey(ceremonies: WebAuthnCeremonies = browserCeremonies): Promise<Account> {
  const options = await request(WebAuthnJson, API.passkeyLoginOptions, { method: "POST" });
  let response: unknown;
  try {
    // SimpleWebAuthn checks the options in depth; zod only proved they are an object.
    response = await ceremonies.authenticate(options as unknown as PublicKeyCredentialRequestOptionsJSON);
  } catch (error) {
    throw ceremonyError(error);
  }
  await request(Ignored, API.passkeyLoginVerify, {
    body: { response },
    messages: {
      400: "Cette clé d'accès n'est pas reconnue. Utilise tes 4 mots.",
      401: "Cette clé d'accès n'est pas reconnue. Utilise tes 4 mots.",
    },
  });
  // The verify answer is not part of the contract: the session cookie is, so ask who we are.
  const account = await fetchMe();
  if (!account) throw new ApiRequestError(401, "La connexion n'a pas abouti. Utilise tes 4 mots.");
  return account;
}
