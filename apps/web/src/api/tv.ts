import {
  API,
  apiPath,
  CreateTvPairingResponse,
  normalizeTvPairingCode,
  type TvPairingStatus,
  TvPairingStatusResponse,
} from "@annamour/protocol";
import { request } from "./http.ts";

/* Linking a TV: the TV asks for a code and waits; a signed-in phone approves it. */

const INVALID_CODE = "Ce code n'est pas valide : il a 6 caractères, par exemple K7P-2QX.";
const UNKNOWN_CODE = "Ce code ne correspond à aucune TV. Vérifie les 6 caractères affichés sur l'écran.";
const EXPIRED_CODE = "Ce code a expiré. La TV en affiche déjà un nouveau : réessaie avec celui-là.";
const USED_CODE = "Ce code a déjà servi. Si la TV n'est pas reliée, utilise le nouveau code qu'elle affiche.";
const TOO_MANY = "Trop d'essais depuis ce réseau. Patiente une heure avant de réessayer.";
const SIGNED_OUT = "Connecte-toi d'abord sur ce téléphone, puis réessaie.";

const CODE_MESSAGES = {
  400: INVALID_CODE,
  401: SIGNED_OUT,
  404: UNKNOWN_CODE,
  409: USED_CODE,
  410: EXPIRED_CODE,
  429: TOO_MANY,
};

/** TV: asks for a pairing code to show, with the secret token to poll with. */
export async function createTvPairing(signal?: AbortSignal): Promise<CreateTvPairingResponse> {
  return request(CreateTvPairingResponse, API.tvPairing, {
    method: "POST",
    signal,
    messages: { 429: "Trop de codes demandés depuis ce réseau. Patiente un peu, la TV réessaiera." },
  });
}

/** TV: has a phone approved the code yet? The first « approved » answer also signs this TV in. */
export async function pollTvPairing(pollToken: string, signal?: AbortSignal): Promise<TvPairingStatus> {
  const { status } = await request(TvPairingStatusResponse, apiPath(API.tvPairingPoll, { pollToken }), { signal });
  return status;
}

/** Phone: where the code stands before approving it (« approved » means it was already used). */
export async function checkTvPairingCode(code: string): Promise<TvPairingStatus> {
  const { status } = await request(
    TvPairingStatusResponse,
    apiPath(API.tvPairingCode, { code: normalizeTvPairingCode(code) }),
    { messages: CODE_MESSAGES },
  );
  return status;
}

/** Phone: links the TV showing `code` to the signed-in account. */
export async function approveTvPairing(code: string): Promise<void> {
  await request(TvPairingStatusResponse, API.tvPairingApprove, {
    body: { code: normalizeTvPairingCode(code) },
    messages: CODE_MESSAGES,
  });
}

export const TV_CODE_MESSAGES = { expired: EXPIRED_CODE, used: USED_CODE } as const;
