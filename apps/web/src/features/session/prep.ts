import type { PrepStatus } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { fetchPrep } from "../../api/rooms.ts";
import { wantsHevcLadder } from "../../sync/hevc-ladder.ts";

/*
 * The salon watches the server prepare the film's lighter qualities, so
 * nobody thinks it is broken while the first minute is being encoded.
 */

const POLL_MS = 2000;

export function prepReady(status: PrepStatus): boolean {
  return !status.available || status.readySeconds >= status.targetSeconds;
}

/** 0 to 1: how much of the minute needed to start is ready. */
export function prepProgress(status: PrepStatus): number {
  if (prepReady(status)) return 1;
  return status.targetSeconds > 0 ? status.readySeconds / status.targetSeconds : 0;
}

/** Asks every 2 s until the film is ready (asking also keeps the server preparing it); null until known. */
export function usePrep(code: string): PrepStatus | null {
  const [status, setStatus] = useState<PrepStatus | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      // This iPad's player will ask for the complete HEVC ladder: the server checks it meanwhile.
      const next = await fetchPrep(code, { hevcLadder: wantsHevcLadder() }).catch(() => null);
      if (stopped) return;
      if (next) setStatus(next);
      if (!next || !prepReady(next)) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code]);

  return status;
}
