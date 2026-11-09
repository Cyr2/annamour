/** Geometry of the red thread: pure, so it can be drawn every frame cheaply. */

export interface Point {
  x: number;
  y: number;
  /** Radius of the anchor: the thread is tied at its rim, not its centre. */
  r: number;
}

const SEGMENTS = 40;

/** The marker on the part of an anchor the thread ties onto (a bubble's disc, not its caption). */
export const KNOT_ATTRIBUTE = "data-thread-knot";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the thread ties onto an anchor, relative to the thread's root: the
 * centre of its knot (the bubble), and the bubble's radius from its layout
 * size, since a bubble that is still scaling in has a smaller box.
 */
export function knotPoint(root: Box, knot: Box, layout: { width: number; height: number }): Point {
  return {
    x: Math.round(knot.left - root.left + knot.width / 2),
    y: Math.round(knot.top - root.top + knot.height / 2),
    r: Math.round(Math.min(layout.width, layout.height) / 2),
  };
}

/**
 * How the thread moves while slack: `wave` ripples along its length (someone is
 * catching up); `gentle` only hangs in one soft curve that slowly rises and sinks.
 */
export type ThreadSway = "wave" | "gentle";

function swayAt(sway: ThreadSway, t: number, time: number, phase: number): number {
  if (sway === "gentle") return Math.sin(time * 0.0012 + phase);
  return (
    Math.sin(2 * Math.PI * 1.5 * t - time * 0.0032 + phase) +
    0.35 * Math.sin(2 * Math.PI * 2.6 * t + time * 0.0021 + phase)
  );
}

function segmentPath(
  from: Point,
  to: Point,
  motion: { sag: number; amplitude: number; time: number; sway: ThreadSway },
  phase: number,
): string {
  const { sag, amplitude, time, sway } = motion;
  const centreLength = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / centreLength;
  const uy = (to.y - from.y) / centreLength;
  const start = { x: from.x + ux * from.r, y: from.y + uy * from.r };
  const end = { x: to.x - ux * to.r, y: to.y - uy * to.r };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Unit normal, oriented so a positive offset hangs downwards.
  const flip = dx / length < 0 ? -1 : 1;
  const nx = (-dy / length) * flip;
  const ny = (dx / length) * flip;
  let d = "";
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const envelope = Math.sin(Math.PI * t); // ends stay tied to the anchors
    const offset = envelope * (sag + amplitude * swayAt(sway, t, time, phase));
    d += `${i === 0 ? "M" : "L"}${(start.x + dx * t + nx * offset).toFixed(1)} ${(start.y + dy * t + ny * offset).toFixed(1)}`;
  }
  return d;
}

/** One sub-path per pair of neighbours; each sways a little out of step with the others. */
export function threadPath(
  points: Point[],
  sag: number,
  amplitude: number,
  time: number,
  sway: ThreadSway = "wave",
): string {
  let d = "";
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    if (from && to) d += segmentPath(from, to, { sag, amplitude, time, sway }, i * 1.7);
  }
  return d;
}
