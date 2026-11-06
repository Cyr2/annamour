/**
 * How a client catches up with the shared position.
 * Small drift is absorbed by nudging the playback rate (inaudible below ~5%);
 * large drift jumps straight to the target.
 */
export interface DriftPolicy {
  /** Below this, do nothing (seconds). */
  tolerance: number;
  /** Above this, seek instead of nudging (seconds). */
  seekThreshold: number;
  /** Maximum rate deviation from 1 while nudging. */
  maxNudge: number;
  /** Seconds of drift corrected per second of playback, before clamping. */
  gain: number;
}

export const defaultDriftPolicy: DriftPolicy = {
  tolerance: 0.06,
  seekThreshold: 1,
  maxNudge: 0.05,
  gain: 0.5,
};

export type Correction =
  | { kind: "none"; rate: 1 }
  | { kind: "nudge"; rate: number }
  | { kind: "seek"; to: number; rate: 1 };

/** `local` is where the player is, `target` where it should be. */
export function correct(local: number, target: number, policy: DriftPolicy = defaultDriftPolicy): Correction {
  const drift = target - local;
  const size = Math.abs(drift);
  if (size < policy.tolerance) return { kind: "none", rate: 1 };
  if (size >= policy.seekThreshold) return { kind: "seek", to: target, rate: 1 };
  const nudge = Math.min(policy.maxNudge, Math.max(-policy.maxNudge, drift * policy.gain));
  return { kind: "nudge", rate: 1 + nudge };
}
