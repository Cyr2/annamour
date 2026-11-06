import type { Transition } from "motion/react";

/**
 * Named motion presets. iOS-like springs; exits are quicker than entrances
 * so the interface never makes anyone wait for something to leave.
 */
export const spring = {
  /** Default for controls, sheets and layout changes. */
  ui: { type: "spring", stiffness: 380, damping: 32, mass: 1 },
  /** Small, quick confirmations: a letter landing, a toggle. */
  snappy: { type: "spring", stiffness: 560, damping: 30, mass: 0.8 },
  /** Presence bubbles: softer, with a little life in them. */
  bubble: { type: "spring", stiffness: 210, damping: 18, mass: 1 },
  /** Toast capsule springing in from the top. */
  capsule: { type: "spring", stiffness: 420, damping: 30, mass: 0.9 },
  /** The red thread pulling taut: underdamped so it twangs once. */
  thread: { type: "spring", stiffness: 240, damping: 9, mass: 0.7 },
} as const satisfies Record<string, Transition>;

export const exit = {
  /** Default exit: fast, accelerating away. */
  quick: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  fade: { duration: 0.12, ease: "linear" },
  /** A sheet sliding back down: about two thirds of its spring in. */
  sheet: { duration: 0.24, ease: [0.4, 0, 1, 1] },
} as const satisfies Record<string, Transition>;

export const duration = {
  fast: 0.15,
  base: 0.22,
  slow: 0.3,
} as const;

/** A gentle error shake, in px offsets. */
export const shakeKeyframes = [0, -9, 8, -6, 4, -2, 0];
export const shakeTransition: Transition = { duration: 0.42, ease: "easeOut" };
