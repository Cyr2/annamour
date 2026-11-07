import { useEffect, useRef } from "react";
import { type BackHandler, pushBackHandler } from "./back.ts";

/** While `enabled`, the remote's Retour asks `handler` first (see back.ts). */
export function useTvBack(handler: BackHandler, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return pushBackHandler(() => latest.current());
  }, [enabled]);
}
