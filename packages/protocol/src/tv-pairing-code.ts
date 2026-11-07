/**
 * Short code a TV shows so a signed-in phone can link it to its account.
 * Six characters without look-alikes (no I, L, O, 0, 1), shown as "K7P-2QX"
 * because it is read across a living room and typed on a phone.
 */
export const TV_PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TV_PAIRING_CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${TV_PAIRING_CODE_ALPHABET}]{${TV_PAIRING_CODE_LENGTH}}$`);

/** Draws a code; `randomInt(max)` returns an integer in [0, max) (crypto on the server). */
export function generateTvPairingCode(randomInt: (max: number) => number): string {
  let code = "";
  for (let i = 0; i < TV_PAIRING_CODE_LENGTH; i++) {
    code += TV_PAIRING_CODE_ALPHABET[randomInt(TV_PAIRING_CODE_ALPHABET.length)] ?? "";
  }
  return code;
}

/** Uppercases and drops spaces and dashes, so "k7p-2qx" reads as "K7P2QX". */
export function normalizeTvPairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

/** True for a normalized code ("K7P2QX"). */
export function isTvPairingCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** The way the code is displayed: "K7P2QX" becomes "K7P-2QX". */
export function formatTvPairingCode(code: string): string {
  const half = TV_PAIRING_CODE_LENGTH / 2;
  return `${code.slice(0, half)}-${code.slice(half)}`;
}
