import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { KEY_WORD_COUNT, WORDLIST_FR } from "@annamour/protocol";

export type RandomInt = (max: number) => number;

/** Draws a fresh 4-word key with a cryptographic random source. */
export function generateAccountKey(random: RandomInt = randomInt): string[] {
  return Array.from({ length: KEY_WORD_COUNT }, () => WORDLIST_FR[random(WORDLIST_FR.length)] ?? "");
}

/**
 * The only trace of a key on the server. The pepper lives outside the
 * database, so a leaked database alone cannot be brute-forced.
 */
export function hashAccountKey(words: readonly string[], pepper: string): string {
  return createHmac("sha256", pepper).update(words.join(" ")).digest("hex");
}

/** A random bearer token (cookies, QR codes): 32 bytes, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored hashed, so reading the database does not sign anyone in. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
