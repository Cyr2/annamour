import { LINK_TOKEN_TTL_MS, type LinkToken } from "@annamour/protocol";

/*
 * The QR code's life, counted on this device's clock: the server's
 * `expiresAt` is on its own clock, and a phone set a few minutes ahead would
 * otherwise see every code expire at once and ask for new ones in a loop.
 */

export interface LiveLinkToken {
  token: string;
  /** When it stops working, on this device's clock. */
  deadline: number;
}

export function liveToken(link: LinkToken, receivedAt: number): LiveLinkToken {
  return { token: link.token, deadline: receivedAt + LINK_TOKEN_TTL_MS };
}

export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** 299 → "4:59". */
export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The address the other device opens: the token stays in the hash, never sent in a request line. */
export function linkUrl(origin: string, token: string): string {
  return `${origin}/lier#${token}`;
}
