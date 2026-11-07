import { createContext, use } from "react";

/**
 * True where an endless animation drawn by script costs too much (a TV's
 * chip): such loops hold still, while transitions and compositor-only loops
 * still play. Set once at startup.
 */
export const CalmMotionContext = createContext(false);

export function useCalmMotion(): boolean {
  return use(CalmMotionContext);
}
