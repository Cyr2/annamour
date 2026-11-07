import {
  formatTvPairingCode,
  isTvPairingCode,
  normalizeTvPairingCode,
  TV_PAIRING_CODE_LENGTH,
} from "@annamour/protocol";

/*
 * The phone's side of linking a TV: the code comes from the QR link
 * (/tv#K7P2QX) or is typed in the profile, with or without its dash.
 */

/** The code in the QR link's fragment (never sent to the server's logs), or null when there is none. */
export function codeFromHash(hash: string): string | null {
  let raw = hash.replace(/^#/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // A broken escape: read the fragment as it is.
  }
  const code = normalizeTvPairingCode(raw);
  return isTvPairingCode(code) ? code : null;
}

/** What the field shows while typing: uppercase, the dash put in after 3 characters. */
export function formatTyping(raw: string): string {
  const code = normalizeTvPairingCode(raw)
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, TV_PAIRING_CODE_LENGTH);
  return code.length > TV_PAIRING_CODE_LENGTH / 2 ? formatTvPairingCode(code) : code;
}

/** The typed code ready to send, or null with the reason to show. */
export function readTypedCode(raw: string): { code: string } | { error: string } {
  const code = normalizeTvPairingCode(raw);
  if (isTvPairingCode(code)) return { code };
  if (code.length < TV_PAIRING_CODE_LENGTH) return { error: "Il manque des caractères : le code de la TV en a 6." };
  return { error: "Ce code n'est pas valide. Recopie les 6 caractères affichés sur la TV, par exemple K7P-2QX." };
}
