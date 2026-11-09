import { RoomCode } from "@annamour/protocol";
import { z } from "zod/mini";
import { create } from "zustand";
import * as accounts from "../../api/accounts.ts";
import { readStored, removeStored, writeStored } from "../../lib/storage.ts";

/*
 * Someone who opened a séance link without an account and chose « Entrer avec
 * un prénom »: they watch with a name and a colour, nothing else (no séances,
 * no circles). Remembered on this device, so the next link opens straight in.
 * « Garder cette séance » then names the séance to keep once the account exists.
 */

const GUEST_STORAGE = "annamour:guest:v1";
const StoredGuest = z.object({ entered: z.boolean(), keep: z.nullable(RoomCode) });

export interface GuestState {
  /** This device chose to watch without an account. */
  entered: boolean;
  /** The séance to add to the account about to be made or opened here. */
  keep: string | null;
}

const EMPTY: GuestState = { entered: false, keep: null };

export const useGuest = create<GuestState>()(() => readStored(GUEST_STORAGE, StoredGuest) ?? EMPTY);

function save(changes: Partial<GuestState>): void {
  useGuest.setState(changes);
  const { entered, keep } = useGuest.getState();
  writeStored(GUEST_STORAGE, { entered, keep });
}

/** « Entrer avec un prénom »: séance links now open without asking again. */
export function enterAsGuest(): void {
  save({ entered: true });
}

/** « Garder cette séance »: the next account signed in here gets it. */
export function keepSeanceLater(code: string): void {
  save({ keep: code });
}

/**
 * Once an account is on this device it is no guest any more: the séance it
 * asked to keep joins its séances (and comes back anyway the next time it is opened).
 */
export async function settleGuest(): Promise<void> {
  const { keep } = useGuest.getState();
  useGuest.setState(EMPTY);
  removeStored(GUEST_STORAGE);
  if (keep === null) return;
  try {
    await accounts.keepSession(keep);
  } catch {
    // The séance is gone, or the network is: opening it again records it all the same.
  }
}
