import { useEffect, useRef, useState } from "react";
import { createTvPairing, pollTvPairing } from "../../api/tv.ts";
import { type PairingHandle, type PairingState, startTvPairing } from "./pairing.ts";

/** While mounted, shows a working pairing code and calls `onApproved` once a phone approves it. */
export function useTvPairing(onApproved: () => void | Promise<void>): { state: PairingState; retry: () => void } {
  const [state, setState] = useState<PairingState>({ phase: "starting" });
  const handle = useRef<PairingHandle | null>(null);
  const approved = useRef(onApproved);
  approved.current = onApproved;

  useEffect(() => {
    const pairing = startTvPairing({
      create: createTvPairing,
      poll: pollTvPairing,
      onState: setState,
      onApproved: () => approved.current(),
    });
    handle.current = pairing;
    return () => {
      pairing.stop();
      handle.current = null;
    };
  }, []);

  return { state, retry: () => handle.current?.retry() };
}
