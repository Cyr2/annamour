import { z } from "zod/mini";
import { CatalogId, CatalogMediaType } from "./catalog.ts";
import { BubbleColor, Name, RoomCode } from "./messages.ts";
import { isTvPairingCode, normalizeTvPairingCode } from "./tv-pairing-code.ts";

/**
 * HTTP contract between the PWA and the server for accounts and the
 * sessions history. Accounts have no email or password: a 4-word key is the
 * account, a QR code links another device, a passkey is an optional shortcut.
 */

export const KEY_WORD_COUNT = 4;
/** Every key word is lowercase French letters (accents allowed), 2 to 20 characters. */
export const KeyWord = z
  .string()
  .check(z.trim(), z.toLowerCase(), z.regex(/^[a-zàâäçéèêëîïôöùûüÿœæ]{2,20}$/u, "invalid key word"));
export const AccountKey = z.array(KeyWord).check(z.length(KEY_WORD_COUNT));
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

/** Whether 4 words a device kept are the key of the account it is signed in to. */
export const KeyCheckResponse = z.object({ matches: z.boolean() });
export type KeyCheckResponse = z.infer<typeof KeyCheckResponse>;

/** A new key for the signed-in account: the previous words stop working. */
export const NewKeyResponse = z.object({ key: AccountKey });
export type NewKeyResponse = z.infer<typeof NewKeyResponse>;

export const AccountResponse = z.object({ account: Account });
export type AccountResponse = z.infer<typeof AccountResponse>;

export const UpdateAccountRequest = z
  .object({ name: z.optional(Name), color: z.optional(BubbleColor) })
  .check(z.refine((u) => u.name !== undefined || u.color !== undefined, "nothing to update"));
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequest>;

/** One-time token shown as a QR code to sign another device in. */
export const LinkToken = z.object({ token: z.string().check(z.minLength(16)), expiresAt: z.number() });
export type LinkToken = z.infer<typeof LinkToken>;
export const LinkWithTokenRequest = z.object({ token: z.string().check(z.minLength(16)) });
export type LinkWithTokenRequest = z.infer<typeof LinkWithTokenRequest>;

/** Someone who was in a session with you. */
export const Participant = z.object({ accountId: z.string(), name: Name, color: BubbleColor });
export type Participant = z.infer<typeof Participant>;
/** Someone of a séance; `left` once they took it out of their séances (the others still see who was there). */
export const SessionParticipant = z.object({ ...Participant.shape, left: z.optional(z.boolean()) });
export type SessionParticipant = z.infer<typeof SessionParticipant>;

/** One film or episode of a séance: its name, and from the catalog its kind and poster. */
export const SeanceItem = z.object({
  title: z.string(),
  type: z.optional(CatalogMediaType),
  posterUrl: z.optional(z.url({ protocol: /^https$/ })),
});
export type SeanceItem = z.infer<typeof SeanceItem>;

/** A séance's circle as anyone of the séance sees it, a guest not in it included: its name, its people. */
export const SeanceCircle = z.object({ name: z.optional(z.string()), members: z.array(Participant) });
export type SeanceCircle = z.infer<typeof SeanceCircle>;

export const SessionSummary = z.object({
  code: RoomCode,
  title: z.string(),
  duration: z.optional(z.number()),
  /** Last saved position, in seconds: where the session resumes. */
  position: z.number().check(z.gte(0)),
  lastUsedAt: z.number(),
  /** The other people of the session; never includes the requester. */
  participants: z.array(SessionParticipant),
  /** Where the séance is among its episodes; `duration` and `position` are this episode's. */
  episode: z.object({ index: z.number(), count: z.number(), label: z.optional(z.string()) }),
  /** Every film or episode of the séance in order (`episode.index` is the one playing); only when it has several. */
  queue: z.optional(z.array(SeanceItem)),
  /** The circle the séance belongs to (see circles.ts); absent for a séance watched alone. */
  circleId: z.optional(z.string()),
  /** That circle's name and people, so the salon can tell whose séance it is. */
  circle: z.optional(SeanceCircle),
  /** I created it: I may delete it for everyone (the others can only leave it). */
  createdByMe: z.optional(z.boolean()),
  /** The catalog title it plays (the series, for an episode): a title in « Notre liste » leads back to its séance. */
  catalog: z.optional(z.object({ id: CatalogId, type: CatalogMediaType })),
  /** The current episode's poster, for a séance started from the catalog; absent for a pasted link. */
  posterUrl: z.optional(z.url({ protocol: /^https$/ })),
});
export type SessionSummary = z.infer<typeof SessionSummary>;
export const SessionList = z.object({ sessions: z.array(SessionSummary) });
export type SessionList = z.infer<typeof SessionList>;

export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/**
 * How ready the séance's lighter qualities are, from where it is
 * (GET /api/rooms/:code/prep). Asking also starts their preparation.
 */
export const PrepStatus = z.object({
  /** The film gets lighter qualities (false: its source is already light, or the server cannot make them). */
  available: z.boolean(),
  /** Seconds encoded in a row from the séance's position, up to `targetSeconds`. */
  readySeconds: z.number(),
  /** Enough to start without waiting: encoding then stays well ahead. */
  targetSeconds: z.number(),
});
export type PrepStatus = z.infer<typeof PrepStatus>;

/**
 * Our hls.js player on an iPad that decodes HEVC asks for the complete HEVC
 * ladder by adding `?hevc=1` to the master playlist's address (and to /prep,
 * so the server checks it ahead). hls.js never leaves the codec family it
 * starts on, so whoever does not ask (Chrome, the Android TV app, Safari's
 * own player) never gets that ladder.
 */
export const HEVC_LADDER_PARAM = "hevc";
const HevcLadderFlag = z.literal("1");

/** The value of `?hevc=` asks for the complete HEVC ladder: only "1" does. */
export function asksHevcLadder(value: string | null | undefined): boolean {
  return HevcLadderFlag.safeParse(value).success;
}

/** `url` asking for the complete HEVC ladder. */
export function withHevcLadder(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${HEVC_LADDER_PARAM}=1`;
}

/**
 * Passkey ceremonies exchange WebAuthn JSON (as produced by SimpleWebAuthn);
 * the library validates those payloads, so they stay opaque here.
 */
export const WebAuthnJson = z.record(z.string(), z.unknown());
export const PasskeyLoginVerifyRequest = z.object({ response: WebAuthnJson });
export const PasskeyRegisterVerifyRequest = z.object({ response: WebAuthnJson });

/**
 * Linking a TV without typing on it (device-code style): the TV asks for a
 * pairing, shows its short code and polls with its secret poll token; a
 * signed-in phone approves the code; the next poll signs the TV in.
 */
export const TvPairingCode = z
  .pipe(z.string(), z.transform(normalizeTvPairingCode))
  .check(z.refine(isTvPairingCode, "invalid code"));
export const TvPairingStatus = z.enum(["pending", "approved", "expired"]);
export type TvPairingStatus = z.infer<typeof TvPairingStatus>;
/** Secret known only to the TV: it alone can claim the session (URL-safe, see randomToken on the server). */
export const TvPollToken = z.string().check(z.regex(/^[\w-]{16,128}$/, "invalid poll token"));
export const CreateTvPairingResponse = z.object({
  /** Display form, e.g. "K7P-2QX". */
  code: z.string(),
  pollToken: TvPollToken,
  expiresAt: z.number(),
});
export type CreateTvPairingResponse = z.infer<typeof CreateTvPairingResponse>;
export const TvPairingStatusResponse = z.object({ status: TvPairingStatus });
export type TvPairingStatusResponse = z.infer<typeof TvPairingStatusResponse>;
export const ApproveTvPairingRequest = z.object({ code: TvPairingCode });
export type ApproveTvPairingRequest = z.infer<typeof ApproveTvPairingRequest>;

export const API = {
  createAccount: "/api/account",
  loginWithKey: "/api/account/login",
  linkWithToken: "/api/account/link",
  /** POST: whose account a QR code opens, without using the code. */
  linkTokenAccount: "/api/account/link/account",
  me: "/api/me",
  linkToken: "/api/me/link-token",
  checkKey: "/api/me/key",
  newKey: "/api/me/key/new",
  sessions: "/api/me/sessions",
  /**
   * POST: keep a séance watched as a guest, once the account exists.
   * DELETE: leave a séance (it leaves my séances and my circles' counts; the others keep it).
   */
  session: "/api/me/sessions/:code",
  /** DELETE: the person who created a séance removes it for everyone. */
  sessionForEveryone: "/api/me/sessions/:code/everyone",
  /** POST: the video on screen is over (left in its last minutes): as if it had played to its end. */
  sessionFinished: "/api/me/sessions/:code/finished",
  logout: "/api/logout",
  passkeyRegisterOptions: "/api/passkey/register/options",
  passkeyRegisterVerify: "/api/passkey/register/verify",
  passkeyLoginOptions: "/api/passkey/login/options",
  passkeyLoginVerify: "/api/passkey/login/verify",
  tvPairing: "/api/tv/pairing",
  tvPairingPoll: "/api/tv/pairing/:pollToken",
  tvPairingApprove: "/api/tv/pairing/approve",
  tvPairingCode: "/api/tv/pairing/code/:code",
} as const;

/** Fills the `:param` segments of an API path, e.g. apiPath(API.tvPairingPoll, { pollToken }). */
export function apiPath(path: string, params: Record<string, string>): string {
  return path.replace(/:(\w+)/g, (segment, name: string) => {
    const value = params[name];
    return value === undefined ? segment : encodeURIComponent(value);
  });
}

export const SESSION_COOKIE = "am_session";
export const LINK_TOKEN_TTL_MS = 5 * 60 * 1000;
export const ROOM_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
export const KEY_LOGIN_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 } as const;
export const TV_PAIRING_TTL_MS = 10 * 60 * 1000;
export const TV_PAIRING_POLL_INTERVAL_MS = 2000;
/** A TV left on its pairing screen asks for a new code every 10 minutes. */
export const TV_PAIRING_CREATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 } as const;
/** Checking and approving codes, per address: enough for typos, far too few to guess. */
export const TV_PAIRING_APPROVE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 } as const;
