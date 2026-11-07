import { type CreateTvPairingResponse, TV_PAIRING_POLL_INTERVAL_MS, type TvPairingStatus } from "@annamour/protocol";
import { errorMessage } from "../../api/http.ts";

/*
 * The TV's side of linking (device-code style): show a code, ask the server
 * every 2 s whether a phone approved it, and on « approved » the TV holds
 * its session. An expired code is replaced by a fresh one on its own, so a
 * TV left on this screen always shows a code that works.
 */

export type PairingState =
  | { phase: "starting" }
  | { phase: "waiting"; code: string; expiresAt: number }
  | { phase: "error"; message: string };

export interface PairingDeps {
  create: (signal: AbortSignal) => Promise<CreateTvPairingResponse>;
  poll: (pollToken: string, signal: AbortSignal) => Promise<TvPairingStatus>;
  onState: (state: PairingState) => void;
  /** The TV now has its session cookie: load the account. */
  onApproved: () => void | Promise<void>;
  now?: () => number;
  pollEveryMs?: number;
  /** After a failure to get a code, the TV tries again on its own after this long. */
  retryAfterMs?: number;
}

export interface PairingHandle {
  /** Asks for a new code right away (the « Réessayer » button). */
  retry: () => void;
  stop: () => void;
}

export const PAIRING_RETRY_MS = 15_000;

export function startTvPairing({
  create,
  poll,
  onState,
  onApproved,
  now = Date.now,
  pollEveryMs = TV_PAIRING_POLL_INTERVAL_MS,
  retryAfterMs = PAIRING_RETRY_MS,
}: PairingDeps): PairingHandle {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const later = (run: () => Promise<void>, delay: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void run(), delay);
  };

  const requestCode = async (): Promise<void> => {
    clearTimeout(timer);
    onState({ phase: "starting" });
    try {
      const pairing = await create(controller.signal);
      if (stopped) return;
      onState({ phase: "waiting", code: pairing.code, expiresAt: pairing.expiresAt });
      later(() => check(pairing), pollEveryMs);
    } catch (error) {
      if (stopped) return;
      onState({ phase: "error", message: errorMessage(error) });
      later(requestCode, retryAfterMs);
    }
  };

  const check = async (pairing: CreateTvPairingResponse): Promise<void> => {
    if (now() >= pairing.expiresAt) return requestCode();
    let status: TvPairingStatus;
    try {
      status = await poll(pairing.pollToken, controller.signal);
    } catch {
      // A dropped request (Wi-Fi, a restart): the code is still good, ask again.
      return later(() => check(pairing), pollEveryMs);
    }
    if (stopped) return;
    if (status === "pending") return later(() => check(pairing), pollEveryMs);
    if (status === "expired") return requestCode();
    stopped = true;
    await onApproved();
  };

  void requestCode();

  return {
    retry: () => {
      if (!stopped) void requestCode();
    },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    },
  };
}
