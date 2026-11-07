import { byRecentUse, type Circle, type WatchlistItem } from "@annamour/protocol";
import { ofCircle } from "../circles/circle-rules.ts";

/** One floor of « Notre liste »: a circle and its titles; `circle` null holds those that fit no circle. */
export interface Shelf {
  circle: Circle | null;
  items: WatchlistItem[];
}

/**
 * The titles, one shelf per circle, the circle used most recently first. A
 * title shared before circles existed may fit several: it shows once, on the
 * first. Titles in the order given (sort them before).
 */
export function shelvesFor(circles: readonly Circle[], items: readonly WatchlistItem[], me: string): Shelf[] {
  const placed = new Set<string>();
  const shelves: Shelf[] = [];
  for (const circle of byRecentUse(circles)) {
    const own = ofCircle(items, circle, me).filter((entry) => !placed.has(entry.id));
    for (const entry of own) placed.add(entry.id);
    if (own.length > 0) shelves.push({ circle, items: own });
  }
  const rest = items.filter((entry) => !placed.has(entry.id));
  return rest.length > 0 ? [...shelves, { circle: null, items: rest }] : shelves;
}
