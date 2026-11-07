/**
 * How a client catches up with the shared position.
 *
 * Seeking is the expensive move on a weak network: landing outside what is
 * already downloaded throws the buffer away and stalls again, which pauses
 * everyone. So drift is absorbed by a fixed, inaudible rate change, with a
 * dead zone and hysteresis (no oscillation, the rate is rarely rewritten), and
 * only a large drift seeks: into the buffer, or anywhere once it is too large
 * to catch up by speed.
 */
export interface DriftPolicy {
  /** Start correcting at this drift (seconds). */
  startAt: number;
  /** Once correcting, stop below this drift (seconds). */
  stopAt: number;
  /** Rate deviation from 1 while correcting. */
  nudge: number;
  /** Seek at or above this drift, if the target is already downloaded (seconds). */
  seekInBuffer: number;
  /** Seek at or above this drift, even if the target must be downloaded (seconds). */
  seekAnyway: number;
}

export const defaultDriftPolicy: DriftPolicy = {
  startAt: 0.25,
  stopAt: 0.08,
  nudge: 0.05,
  seekInBuffer: 4,
  seekAnyway: 10,
};

export type Correction =
  | { kind: "none"; rate: 1 }
  | { kind: "nudge"; rate: number }
  | { kind: "seek"; to: number; rate: 1 };

export interface DriftContext {
  /** A rate correction is under way (the hysteresis keeps it until `stopAt`). */
  correcting?: boolean;
  /** The target position is already downloaded, so seeking there costs nothing. */
  targetBuffered?: boolean;
}

/** `local` is where the player is, `target` where it should be. */
export function correct(
  local: number,
  target: number,
  { correcting = false, targetBuffered = false }: DriftContext = {},
  policy: DriftPolicy = defaultDriftPolicy,
): Correction {
  const drift = target - local;
  const size = Math.abs(drift);
  const seekAt = targetBuffered ? policy.seekInBuffer : policy.seekAnyway;
  if (size >= seekAt) return { kind: "seek", to: target, rate: 1 };
  if (size < (correcting ? policy.stopAt : policy.startAt)) return { kind: "none", rate: 1 };
  return { kind: "nudge", rate: 1 + Math.sign(drift) * policy.nudge };
}
