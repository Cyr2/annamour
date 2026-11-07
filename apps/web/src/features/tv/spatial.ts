import type { Direction } from "./remote.ts";

/*
 * Spatial navigation, the geometry: from the focused box, which box does an
 * arrow lead to? Only boxes ahead in that direction count; the nearest wins,
 * where being out of line (not overlapping across the axis) costs much more
 * than being far along it. So → stays in its row (and stops at its end), ↓
 * goes to the row below and lands on the item under the focus, ↑ reaches a
 * corner button above when nothing is right above.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How much more a step out of line costs than a step along the arrow. */
const OUT_OF_LINE_WEIGHT = 3;
/** Among boxes equally far and in line, the one best centred on the focus wins. */
const CENTRE_WEIGHT = 0.05;

const centre = (low: number, high: number) => (low + high) / 2;

/** The distance between two intervals, 0 when they overlap. */
function gap(aLow: number, aHigh: number, bLow: number, bHigh: number): number {
  return Math.max(0, bLow - aHigh, aLow - bHigh);
}

interface Axes {
  /** `to` lies past `from` in the arrow's direction. */
  ahead: (from: Box, to: Box) => boolean;
  /** The gap between them along the arrow. */
  along: (from: Box, to: Box) => number;
  /** The gap across the arrow, 0 when they are in line. */
  across: (from: Box, to: Box) => number;
  offCentre: (from: Box, to: Box) => number;
}

/** ← → never leave the row: the box must share some height with the focus (↑ ↓ go between rows). */
const horizontal = (sign: 1 | -1): Axes => ({
  ahead: (f, t) =>
    gap(f.top, f.bottom, t.top, t.bottom) === 0 &&
    (sign > 0
      ? centre(t.left, t.right) > centre(f.left, f.right) && t.right > f.right && t.left > f.left
      : centre(t.left, t.right) < centre(f.left, f.right) && t.left < f.left && t.right < f.right),
  along: (f, t) => (sign > 0 ? Math.max(0, t.left - f.right) : Math.max(0, f.left - t.right)),
  across: (f, t) => gap(f.top, f.bottom, t.top, t.bottom),
  offCentre: (f, t) => Math.abs(centre(f.top, f.bottom) - centre(t.top, t.bottom)),
});

const vertical = (sign: 1 | -1): Axes => ({
  ahead: (f, t) =>
    sign > 0
      ? centre(t.top, t.bottom) > centre(f.top, f.bottom) && t.bottom > f.bottom && t.top > f.top
      : centre(t.top, t.bottom) < centre(f.top, f.bottom) && t.top < f.top && t.bottom < f.bottom,
  along: (f, t) => (sign > 0 ? Math.max(0, t.top - f.bottom) : Math.max(0, f.top - t.bottom)),
  across: (f, t) => gap(f.left, f.right, t.left, t.right),
  offCentre: (f, t) => Math.abs(centre(f.left, f.right) - centre(t.left, t.right)),
});

const AXES: Record<Direction, Axes> = {
  right: horizontal(1),
  left: horizontal(-1),
  down: vertical(1),
  up: vertical(-1),
};

/** The cost of going from `from` to `to`, or null when `to` is not in that direction. */
export function distance(from: Box, to: Box, direction: Direction): number | null {
  const axes = AXES[direction];
  if (!axes.ahead(from, to)) return null;
  return axes.along(from, to) + OUT_OF_LINE_WEIGHT * axes.across(from, to) + CENTRE_WEIGHT * axes.offCentre(from, to);
}

/** Index of the box the arrow leads to, or -1 when there is nothing that way. */
export function nextIndex(from: Box, candidates: readonly Box[], direction: Direction): number {
  let best = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate, index) => {
    const cost = distance(from, candidate, direction);
    if (cost !== null && cost < bestCost) {
      best = index;
      bestCost = cost;
    }
  });
  return best;
}
