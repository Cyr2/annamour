import { z } from "zod";
import { BubbleColor, Name, RoomCode } from "./messages.ts";

/**
 * HTTP contract between the PWA and the server for accounts and the
 * sessions history. Accounts have no email or password: a 4-word key is the
 * account, a QR code links another device, a passkey is an optional shortcut.
 */

export const KEY_WORD_COUNT = 4;
/** Every key word is lowercase French letters (accents allowed), 2 to 20 characters. */
export const KeyWord = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-zàâäçéèêëîïôöùûüÿœæ]{2,20}$/u, "invalid key word");
export const AccountKey = z.array(KeyWord).length(KEY_WORD_COUNT);
export type AccountKey = z.infer<typeof AccountKey>;

export const Account = z.object({
  id: z.string(),
  name: Name,
  color: BubbleColor,
  hasPasskey: z.boolean(),
});
export type Account = z.infer<typeof Account>;

export const CreateAccountRequest = z.object({ name: Name, color: BubbleColor });
export type CreateAccountRequest = z.infer<typeof CreateAccountRequest>;
/** The key is returned once, at creation: the server only keeps a keyed hash of it. */
export const CreateAccountResponse = z.object({ account: Account, key: AccountKey });
export type CreateAccountResponse = z.infer<typeof CreateAccountResponse>;

export const LoginWithKeyRequest = z.object({ key: AccountKey });
export type LoginWithKeyRequest = z.infer<typeof LoginWithKeyRequest>;

export const AccountResponse = z.object({ account: Account });
export type AccountResponse = z.infer<typeof AccountResponse>;

export const UpdateAccountRequest = z
  .object({ name: Name.optional(), color: BubbleColor.optional() })
  .refine((u) => u.name !== undefined || u.color !== undefined, "nothing to update");
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequest>;

/** One-time token shown as a QR code to sign another device in. */
export const LinkToken = z.object({ token: z.string().min(16), expiresAt: z.number() });
export type LinkToken = z.infer<typeof LinkToken>;
export const LinkWithTokenRequest = z.object({ token: z.string().min(16) });
export type LinkWithTokenRequest = z.infer<typeof LinkWithTokenRequest>;

/** Someone who was in a session with you. */
export const Participant = z.object({ accountId: z.string(), name: Name, color: BubbleColor });
export type Participant = z.infer<typeof Participant>;

export const SessionSummary = z.object({
  code: RoomCode,
  title: z.string(),
  duration: z.number().optional(),
  /** Last saved position, in seconds: where the session resumes. */
  position: z.number().min(0),
  lastUsedAt: z.number(),
  /** The other people of the session; never includes the requester. */
  participants: z.array(Participant),
});
export type SessionSummary = z.infer<typeof SessionSummary>;
export const SessionList = z.object({ sessions: z.array(SessionSummary) });
export type SessionList = z.infer<typeof SessionList>;

export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/**
 * Passkey ceremonies exchange WebAuthn JSON (as produced by SimpleWebAuthn);
 * the library validates those payloads, so they stay opaque here.
 */
export const WebAuthnJson = z.record(z.string(), z.unknown());
export const PasskeyLoginVerifyRequest = z.object({ response: WebAuthnJson });
export const PasskeyRegisterVerifyRequest = z.object({ response: WebAuthnJson });

export const API = {
  createAccount: "/api/account",
  loginWithKey: "/api/account/login",
  linkWithToken: "/api/account/link",
  me: "/api/me",
  linkToken: "/api/me/link-token",
  sessions: "/api/me/sessions",
  logout: "/api/logout",
  passkeyRegisterOptions: "/api/passkey/register/options",
  passkeyRegisterVerify: "/api/passkey/register/verify",
  passkeyLoginOptions: "/api/passkey/login/options",
  passkeyLoginVerify: "/api/passkey/login/verify",
} as const;

export const SESSION_COOKIE = "am_session";
export const LINK_TOKEN_TTL_MS = 5 * 60 * 1000;
export const ROOM_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
export const KEY_LOGIN_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 } as const;
