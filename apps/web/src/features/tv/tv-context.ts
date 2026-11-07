import { createContext, use } from "react";

/**
 * True on a TV (see tv-mode.ts): screens keep their structure and get their
 * 10-foot variant, driven by the remote. Set once at startup, never changes.
 */
export const TvContext = createContext(false);

export function useTv(): boolean {
  return use(TvContext);
}
