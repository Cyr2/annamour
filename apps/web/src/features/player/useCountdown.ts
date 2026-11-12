import { useEffect, useRef, useState } from "react";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { secondsLeft } from "./episode-rules.ts";

const TICK_MS = 250;

/**
 * Seconds left until `until` (server time), on the shared clock so every screen
 * counts together; at 0 calls `onDone` once (the room moves once, whoever asks first).
 */
export function useCountdown(until: number, client: SyncClient | null, onDone: () => void): number {
  const serverNow = () => client?.serverNow() ?? Date.now();
  const [seconds, setSeconds] = useState(() => secondsLeft(until, serverNow()));
  // The latest callback, without restarting the clock each render.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let asked = false;
    const tick = () => {
      const left = secondsLeft(until, client?.serverNow() ?? Date.now());
      setSeconds(left);
      if (left > 0 || asked) return;
      asked = true;
      done.current();
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [until, client]);

  return seconds;
}
